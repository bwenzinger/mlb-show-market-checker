import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Box,
  Chip,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
  type TextFieldProps,
} from "@mui/material";

import { formatPercent, formatStubs } from "../../marketUtils";

type DebounceTextFieldProps = Omit<TextFieldProps, "onChange" | "value"> & {
  debounceMs?: number;
  onDebouncedChange: (value: string) => void;
  value: string;
};

export const DebounceTextField = memo(function DebounceTextField({
  debounceMs = 300,
  onDebouncedChange,
  value,
  ...textFieldProps
}: DebounceTextFieldProps) {
  const [inputValue, setInputValue] = useState(value);
  const lastCommittedValueRef = useRef(value);

  useEffect(() => {
    if (value !== lastCommittedValueRef.current && value !== inputValue) {
      setInputValue(value);
      lastCommittedValueRef.current = value;
    }
  }, [inputValue, value]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (inputValue !== lastCommittedValueRef.current) {
        lastCommittedValueRef.current = inputValue;
        onDebouncedChange(inputValue);
      }
    }, debounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [debounceMs, inputValue, onDebouncedChange]);

  return (
    <TextField
      {...textFieldProps}
      onChange={(event) => setInputValue(event.target.value)}
      value={inputValue}
    />
  );
});

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

export const MetricCard = memo(function MetricCard({
  badge = null,
  label,
  value,
}: {
  badge?: ReactNode;
  label: string;
  value: string;
}) {
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

export const ProfitMetric = memo(function ProfitMetric({
  profit,
  profitPercentage,
}: {
  profit: number | null;
  profitPercentage: number | null;
}) {
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

export const SectionHeading = memo(function SectionHeading({
  meta,
  title,
}: {
  meta: string;
  title: string;
}) {
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

export const ChartCard = memo(function ChartCard({
  children,
  meta,
  title,
}: {
  children: ReactNode;
  meta: string;
  title: string;
}) {
  return (
    <Paper variant="outlined" sx={{ minWidth: 0, p: 1.75 }}>
      <SectionHeading title={title} meta={meta} />
      {children}
    </Paper>
  );
});
