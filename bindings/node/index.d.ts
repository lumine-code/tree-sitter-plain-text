type BaseNode = {
  type: string;
  named: boolean;
};

type ChildNode = {
  multiple: boolean;
  required: boolean;
  types: BaseNode[];
};

type NodeInfo =
  | (BaseNode & { subtypes: BaseNode[] })
  | (BaseNode & {
      fields: { [name: string]: ChildNode };
      children: ChildNode[];
    });

type Language = {
  name: string;
  language: unknown;
  nodeTypeInfo: NodeInfo[];
  parseOptions: (
    tree: BoundaryTree | null,
    source?: string,
    includedRanges?: BoundaryRange[],
  ) => { includedRanges: BoundaryRange[] } | undefined;
};

type BoundaryPoint = { row: number; column: number };
type BoundaryRange = {
  startIndex: number;
  endIndex: number;
  startPosition: BoundaryPoint;
  endPosition: BoundaryPoint;
};
type BoundaryNode = BoundaryRange & { type: string; hasChanges: boolean; children: BoundaryNode[] };
type BoundaryEdit = {
  startIndex: number;
  oldEndIndex: number;
  newEndIndex: number;
  startPosition: BoundaryPoint;
  oldEndPosition: BoundaryPoint;
  newEndPosition: BoundaryPoint;
};
type BoundaryTree = { rootNode: BoundaryNode; edit?: (edit: BoundaryEdit) => void };

declare const language: Language;
export = language;
