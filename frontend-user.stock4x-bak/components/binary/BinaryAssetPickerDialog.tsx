"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { BinaryAssetList } from "@/components/binary/BinaryAssetList";

interface Props {
  trigger: React.ReactNode;
  assets: string[];
  selected: string;
  onSelect: (symbol: string) => void;
}

/**
 * Bottom-sheet style picker for mobile — the asset list lives in the
 * desktop left rail, but on phones we surface it behind a Dialog so the
 * chart + trade panel can use the full width. Tapping a row closes the
 * dialog immediately so the user lands back on the chart for the new
 * asset.
 */
export function BinaryAssetPickerDialog({ trigger, assets, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="h-[80vh] max-w-md gap-0 overflow-hidden p-0">
        <BinaryAssetList
          assets={assets}
          selected={selected}
          onSelect={(s) => {
            onSelect(s);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
