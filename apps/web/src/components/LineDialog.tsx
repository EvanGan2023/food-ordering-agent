"use client";

import { getItem, type Menu, type MenuItem, type PricedLine, type Selections } from "@foa/core";
import { OptionsDialog } from "./OptionsDialog";
import type { Size } from "./ui";

export type DialogTarget = { mode: "add"; item: MenuItem } | { mode: "edit"; line: PricedLine };

interface Props {
  target: DialogTarget | null;
  menu: Menu | null;
  busy?: boolean;
  size?: Size;
  onAdd: (itemId: string, modifiers: Selections, qty: number) => Promise<boolean>;
  onEdit: (lineId: string, modifiers: Selections) => Promise<boolean>;
  onClose: () => void;
}

/** Opens the options dialog for adding a menu item or changing a cart line. */
export function LineDialog({ target, menu, busy, size, onAdd, onEdit, onClose }: Props) {
  if (!target || !menu) return null;
  const item = target.mode === "add" ? target.item : getItem(menu, target.line.itemId);
  if (!item) return null;
  return (
    <OptionsDialog
      key={target.mode === "add" ? `add-${item.id}` : `edit-${target.line.lineId}`}
      menu={menu}
      item={item}
      mode={target.mode}
      initial={target.mode === "edit" ? target.line.modifiers : undefined}
      size={size}
      busy={busy}
      onClose={onClose}
      onSubmit={(modifiers, qty) =>
        target.mode === "add" ? onAdd(item.id, modifiers, qty) : onEdit(target.line.lineId, modifiers)
      }
    />
  );
}
