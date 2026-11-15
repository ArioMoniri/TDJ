"use client";
import type { ReactNode } from "react";
import { Row } from "./Form";

/**
 * A settings-style row that carries the one-line "what it does" shown on hover and long-press: the rooms and share
 * screens explain every action this way. Form's Row with its help tag (no wrapper, so the list keeps its separators).
 */
export function TipRow({
  tip,
  "data-testid": testId,
  ...row
}: {
  tile?: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  busy?: boolean;
  disabled?: boolean;
  tip?: string;
  id?: string;
  "data-testid"?: string;
}) {
  return <Row {...row} tip={tip} data-testid={testId} />;
}
