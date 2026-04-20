import { memo, type ReactNode } from "react";
import { Paper } from "@mui/material";

import { SectionHeading } from "./SectionHeading";

interface ChartCardProps {
  children: ReactNode;
  meta: string;
  title: string;
}

export const ChartCard = memo(function ChartCard({
  children,
  meta,
  title,
}: ChartCardProps) {
  return (
    <Paper variant="outlined" sx={{ minWidth: 0, p: 1.75 }}>
      <SectionHeading title={title} meta={meta} />
      {children}
    </Paper>
  );
});
