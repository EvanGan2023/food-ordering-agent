"use client";

import { useState } from "react";
import { formatPrice, type ChoiceGroup, type ChoicePrompt, type OfferPrompt } from "@foa/core";
import type { Size } from "../ui";

interface ChipProps {
  label: string;
  extra?: string;
  selected?: boolean;
  kiosk: boolean;
  onClick: () => void;
}

function Chip({ label, extra, selected, kiosk, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border-[1.5px] font-medium transition-colors ${
        selected ? "border-char bg-char text-paper" : "border-char/20 bg-card hover:border-char"
      } ${kiosk ? "min-h-18 px-8 text-2xl" : "min-h-12 px-5 text-base"}`}
    >
      {label}
      {extra && <span className={`ml-1.5 ${selected ? "text-paper/70" : "text-char-soft"}`}>+{extra}</span>}
    </button>
  );
}

const mainButton = (kiosk: boolean) =>
  `rounded-full bg-pickle font-semibold text-white hover:bg-pickle-dark disabled:opacity-40 ${kiosk ? "min-h-18 px-12 text-2xl" : "min-h-12 px-7"}`;
const plainButton = (kiosk: boolean) =>
  `rounded-full border-[1.5px] border-char/20 bg-card font-semibold hover:border-char ${kiosk ? "min-h-18 px-12 text-2xl" : "min-h-12 px-7"}`;

type Picked = Record<string, string[]>;

/** Tap to pick in one group: replaces the pick when only one is allowed, otherwise toggles up to the max. */
function pick(picked: Picked, group: ChoiceGroup, optionId: string): Picked {
  const current = picked[group.groupId] ?? [];
  if (group.max === 1) return { ...picked, [group.groupId]: current[0] === optionId ? [] : [optionId] };
  if (current.includes(optionId)) return { ...picked, [group.groupId]: current.filter((id) => id !== optionId) };
  return current.length < group.max ? { ...picked, [group.groupId]: [...current, optionId] } : picked;
}

const pickedNames = (groups: ChoiceGroup[], picked: Picked) =>
  groups.flatMap((g) => (picked[g.groupId] ?? []).map((id) => g.options.find((o) => o.id === id)?.name ?? id));

function GroupChips({ group, picked, currency, kiosk, showName, onPick }: {
  group: ChoiceGroup;
  picked: Picked;
  currency: string;
  kiosk: boolean;
  showName: boolean;
  onPick: (optionId: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2" role="group" aria-label={group.groupName}>
      {showName && (
        <p className={`text-char-soft ${kiosk ? "text-xl" : "text-sm"}`}>
          {group.groupName}
          {group.max > 1 && ` (up to ${group.max})`}
        </p>
      )}
      <div className="flex max-w-[58rem] flex-wrap justify-center gap-3">
        {group.options.map((option) => (
          <Chip
            key={option.id}
            label={option.name}
            extra={option.priceDelta > 0 ? formatPrice(option.priceDelta, currency) : undefined}
            selected={picked[group.groupId]?.includes(option.id)}
            kiosk={kiosk}
            onClick={() => onPick(option.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The choices the agent asked for. A single pick-one question sends on tap; several questions
 * (size, sugar and ice) are picked together and sent as one answer.
 */
export function ChoiceButtons({ choice, currency, size, onSend }: {
  choice: ChoicePrompt;
  currency: string;
  size: Size;
  onSend: (text: string) => void;
}) {
  const kiosk = size === "kiosk";
  const [picked, setPicked] = useState<Picked>({});
  const single = choice.groups.length === 1 && choice.groups[0]!.max === 1;
  const complete = choice.groups.every((g) => (picked[g.groupId]?.length ?? 0) >= g.min);

  return (
    <div className={`flex flex-col items-center ${kiosk ? "gap-6" : "gap-4"}`} aria-label={`Choose for ${choice.itemName}`}>
      {choice.groups.map((group) => (
        <GroupChips
          key={group.groupId}
          group={group}
          picked={picked}
          currency={currency}
          kiosk={kiosk}
          showName={!single}
          onPick={(optionId) => {
            if (single) return onSend(group.options.find((o) => o.id === optionId)?.name ?? optionId);
            setPicked((p) => pick(p, group, optionId));
          }}
        />
      ))}
      {!single && (
        <button type="button" disabled={!complete} onClick={() => onSend(pickedNames(choice.groups, picked).join(", "))} className={mainButton(kiosk)}>
          Done
        </button>
      )}
    </div>
  );
}

/** What the agent just offered: the meal, and extras like toppings. "No thanks" declines them all. */
export function OfferButtons({ offers, currency, size, onSend }: {
  offers: OfferPrompt[];
  currency: string;
  size: Size;
  onSend: (text: string) => void;
}) {
  const kiosk = size === "kiosk";
  // Picks per offer line, then per group: { l1: { toppings: ["pearls"] } }.
  const [picked, setPicked] = useState<Record<string, Picked>>({});
  const several = offers.length > 1;
  const chosen = offers
    .map((offer) => ({ offer, names: pickedNames(offer.groups, picked[offer.lineId] ?? {}) }))
    .filter((c) => c.names.length);

  return (
    <div className={`flex flex-col items-center ${kiosk ? "gap-6" : "gap-4"}`} aria-label="Add-ons on offer">
      {offers.map((offer) => (
        <div key={offer.lineId} className="flex flex-col items-center gap-3">
          {offer.meal && (
            <button
              type="button"
              onClick={() => onSend(several ? `Yes, make the ${offer.itemName} a meal` : "Yes, make it a meal")}
              className={mainButton(kiosk)}
            >
              Make {several ? `the ${offer.itemName}` : "it"} a meal
              <span className="ml-1.5 font-normal text-white/80">+{formatPrice(offer.meal.extra, currency)}</span>
            </button>
          )}
          {offer.groups.map((group) => (
            <GroupChips
              key={group.groupId}
              group={{ ...group, groupName: several ? `${group.groupName} for ${offer.itemName}` : group.groupName }}
              picked={picked[offer.lineId] ?? {}}
              currency={currency}
              kiosk={kiosk}
              showName
              onPick={(optionId) => setPicked((p) => ({ ...p, [offer.lineId]: pick(p[offer.lineId] ?? {}, group, optionId) }))}
            />
          ))}
        </div>
      ))}
      <div className="flex flex-wrap justify-center gap-3">
        {chosen.length > 0 && (
          <button
            type="button"
            onClick={() =>
              onSend(
                `Add ${chosen.map((c) => `${c.names.join(" and ")}${several ? ` on the ${c.offer.itemName}` : ""}`).join(", and ")}`,
              )
            }
            className={mainButton(kiosk)}
          >
            Add
          </button>
        )}
        <button type="button" onClick={() => onSend("No thanks")} className={plainButton(kiosk)}>
          No thanks
        </button>
      </div>
    </div>
  );
}
