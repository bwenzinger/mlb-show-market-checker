import { Box, Button, Skeleton, Stack, Typography } from '@mui/material';

export function AllCompletedOrdersLoadPrompt({
  onLoad,
  variant,
}: {
  onLoad: () => void;
  variant: 'chart' | 'table';
}) {
  return (
    <Box
      sx={{
        bgcolor: 'background.default',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        minHeight: variant === 'chart' ? 260 : 360,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Box
        sx={{
          filter: 'grayscale(1)',
          opacity: 0.42,
          pointerEvents: 'none',
        }}
      >
        {variant === 'table' ? <MutedTablePreview /> : <MutedChartPreview />}
      </Box>
      <Box
        sx={{
          alignItems: 'center',
          backdropFilter: 'grayscale(1) blur(1px)',
          bgcolor: 'rgba(18, 18, 18, 0.56)',
          display: 'flex',
          inset: 0,
          justifyContent: 'center',
          p: 2,
          position: 'absolute',
        }}
      >
        <Stack
          spacing={1.25}
          sx={{
            alignItems: 'center',
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            boxShadow: 3,
            maxWidth: 280,
            px: 2,
            py: 1.75,
            textAlign: 'center',
          }}
        >
          <Typography fontWeight={900}>Full history not loaded</Typography>
          <Button onClick={onLoad} size="small" variant="contained">
            Load full history
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}

function MutedTablePreview() {
  return (
    <Stack spacing={1} sx={{ p: 1.5 }}>
      {Array.from({ length: 8 }, (_, index) => (
        <Box
          key={index}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            display: 'grid',
            gap: 2,
            gridTemplateColumns: '1fr 72px',
            pb: 1,
          }}
        >
          <Skeleton animation={false} height={18} variant="rounded" />
          <Skeleton animation={false} height={18} variant="rounded" />
        </Box>
      ))}
    </Stack>
  );
}

function MutedChartPreview() {
  return (
    <Box
      component="svg"
      aria-hidden="true"
      viewBox="0 0 720 260"
      sx={{ display: 'block', height: 'auto', width: '100%' }}
    >
      <line
        stroke="currentColor"
        strokeWidth="1"
        x1="28"
        x2="692"
        y1="232"
        y2="232"
      />
      <line
        stroke="currentColor"
        strokeWidth="1"
        x1="28"
        x2="28"
        y1="28"
        y2="232"
      />
      <path
        d="M 28 190 L 96 156 L 164 170 L 232 112 L 300 126 L 368 88 L 436 116 L 504 72 L 572 96 L 640 54 L 692 82"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />
    </Box>
  );
}
