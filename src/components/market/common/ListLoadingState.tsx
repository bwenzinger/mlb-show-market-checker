import { memo } from "react";
import { Box, Skeleton, Stack, Typography } from "@mui/material";

export const ListLoadingState = memo(function ListLoadingState() {
  return (
    <Stack spacing={1} sx={{ minHeight: 240 }}>
      <Typography color="text.secondary" variant="body2">
        Loading market listings...
      </Typography>
      {Array.from({ length: 6 }, (_, index) => (
        <Box
          key={index}
          sx={{
            alignItems: "center",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            display: "flex",
            gap: 1.25,
            minHeight: 72,
            overflow: "hidden",
            px: 1.5,
            py: 1,
          }}
        >
          <Skeleton
            animation="wave"
            sx={{
              borderRadius: 1,
              flex: "0 0 40px",
              height: 40,
              transform: "none",
              width: 40,
            }}
            variant="rectangular"
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton animation="wave" height={20} sx={{ maxWidth: "72%" }} />
            <Skeleton animation="wave" height={16} sx={{ maxWidth: "88%" }} />
          </Box>
          <Box sx={{ flex: "0 0 auto", textAlign: "right" }}>
            <Skeleton
              animation="wave"
              height={20}
              sx={{ ml: "auto", width: 56 }}
            />
            <Skeleton
              animation="wave"
              height={16}
              sx={{ ml: "auto", width: 40 }}
            />
          </Box>
        </Box>
      ))}
    </Stack>
  );
});
