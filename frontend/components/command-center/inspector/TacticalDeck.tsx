"use client";

import { CockpitCard } from "../cockpit/CockpitCard";
import { OwaspAsiMatrix } from "./OwaspAsiMatrix";
import { ContextualInspector } from "./ContextualInspector";
import type { AsiCell, InspectorTarget } from "../prototype/model";

export function TacticalDeck({
  inspectTarget,
  asiList,
  onCloseInspect,
  onSelectAsi,
  onQuarantine,
}: {
  inspectTarget: InspectorTarget | null;
  asiList: AsiCell[];
  onCloseInspect: () => void;
  onSelectAsi: (code: string) => void;
  onQuarantine?: (id: string) => void;
}) {
  return (
    <CockpitCard className="h-full">
      {inspectTarget ? (
        <ContextualInspector
          target={inspectTarget}
          onClose={onCloseInspect}
          onQuarantine={onQuarantine}
        />
      ) : (
        <OwaspAsiMatrix asiList={asiList} onSelectAsi={onSelectAsi} />
      )}
    </CockpitCard>
  );
}
