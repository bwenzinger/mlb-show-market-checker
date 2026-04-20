import { Skeleton, Stack, Typography } from '@mui/material';

export const OrderHistoryLoadingState = function OrderHistoryLoadingState({
  message,
  variant,
}: {
  message: string;
  variant: 'chart' | 'table';
}) {
  return (
    <Stack spacing={1.25}>
      <Typography color="text.secondary" variant="body2">
        {message}
      </Typography>
      {variant === 'table' ? (
        <>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton
              key={index}
              animation="wave"
              height={28}
              sx={{ transform: 'none' }}
              variant="rounded"
            />
          ))}
        </>
      ) : (
        <>
          <Skeleton
            animation="wave"
            height={44}
            sx={{ transform: 'none' }}
            variant="rounded"
          />
          <Skeleton
            animation="wave"
            height={260}
            sx={{ transform: 'none' }}
            variant="rounded"
          />
        </>
      )}
    </Stack>
  );
};
