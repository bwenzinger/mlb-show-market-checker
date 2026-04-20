import { memo } from "react";
import { Paper, Stack, Typography } from "@mui/material";

import { formatPercent, formatStubs } from "../../../marketUtils";

interface ProfitMetricProps {
  profit: number | null;
  profitPercentage: number | null;
}

export const ProfitMetric = memo(function ProfitMetric({
  profit,
  profitPercentage,
}: ProfitMetricProps) {
  const profitColor =
    profit === null
      ? "text.primary"
      : profit > 0
        ? "success.main"
        : "error.main";

  return (
    <Paper
      variant="outlined"
      sx={{
        borderColor: profit !== null && profit > 0 ? "success.dark" : "divider",
        minWidth: 0,
        p: 1.5,
      }}
    >
      <Typography color="text.secondary" variant="caption">
        Profit after 10% tax
      </Typography>
      <Typography
        color={profitColor}
        fontWeight={950}
        lineHeight={1.05}
        sx={{ overflowWrap: "anywhere" }}
        variant="h5"
      >
        {formatStubs(profit)}
      </Typography>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "baseline",
          flexWrap: "wrap",
          mt: 0.75,
          rowGap: 0.25,
        }}
      >
        <Typography color={profitColor} fontWeight={900} variant="body2">
          {formatPercent(profitPercentage)} profit
        </Typography>
      </Stack>
    </Paper>
  );
});
