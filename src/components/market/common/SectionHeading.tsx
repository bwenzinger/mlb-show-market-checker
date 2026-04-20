import { memo } from "react";
import { Stack, Typography } from "@mui/material";

interface SectionHeadingProps {
  meta: string;
  title: string;
}

export const SectionHeading = memo(function SectionHeading({
  meta,
  title,
}: SectionHeadingProps) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      sx={{ alignItems: { xs: "flex-start", sm: "baseline" }, mb: 1.5 }}
    >
      <Typography component="h3" fontWeight={900} sx={{ flex: 1 }} variant="h6">
        {title}
      </Typography>
      <Typography color="text.secondary" variant="body2">
        {meta}
      </Typography>
    </Stack>
  );
});
