import { memo } from "react";
import { Chip } from "@mui/material";

export const QuickSellBadge = memo(function QuickSellBadge() {
  return (
    <Chip
      color="info"
      label="QS"
      size="small"
      sx={{
        fontSize: 10,
        fontWeight: 900,
        height: 18,
        "& .MuiChip-label": {
          px: 0.75,
        },
      }}
      variant="outlined"
    />
  );
});
