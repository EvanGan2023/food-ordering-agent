"use client";

import { getItem, type Menu, type PricedLine, type Selections } from "@foa/core";
import { OptionsDialog } from "./OptionsDialog";
import type { Size } from "./ui";

interface Props {
  line: PricedLine | null;
  menu: Menu | null;
  busy?: boolean;
  size?: Size;
  onEdit: (lineId: string, modifiers: Selections) => Promise<boolean>;
  onClose: () => void;
}

/** Opens the options dialog for changing a line in the order (tap-to-fix). */
export function LineDialog({ line, menu, busy, size, onEdit, onClose }: Props) {
  if (!line || !menu) return null;
  const item = getItem(menu, line.itemId);
  if (!item) return null;
  return (
    <OptionsDialog
      key={line.lineId}
      menu={menu}
      item={item}
      mode="edit"
      initial={line.modifiers}
      size={size}
      busy={busy}
      onClose={onClose}
      onSubmit={(modifiers) => onEdit(line.lineId, modifiers)}
    />
  );
}
