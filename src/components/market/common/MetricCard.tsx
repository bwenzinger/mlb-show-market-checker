import { memo, type ReactNode } from "react";
import { Paper, Stack, Typography } from "@mui/material";

interface MetricCardProps {
  badge?: ReactNode;
  label: string;
  value: string;
}

export const MetricCard = memo(function MetricCard({
  badge = null,
  label,
  value,
}: MetricCardProps) {
  return (
    <Paper variant="outlined" sx={{ minWidth: 0, p: 1.5 }}>
      <Typography color="text.secondary" variant="caption">
        {label}
      </Typography>
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ alignItems: "center", flexWrap: "wrap", minWidth: 0 }}
      >
        <Typography
          fontWeight={900}
          sx={{ overflowWrap: "anywhere" }}
          variant="h6"
        >
          {value}
        </Typography>
        {badge}
      </Stack>
    </Paper>
  );
});
