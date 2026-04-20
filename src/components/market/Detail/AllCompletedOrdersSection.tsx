import { Alert } from '@mui/material';
import { LoadState, OrderPoint } from '../../../marketUtils';
import { ChartCard } from '../common';
import { OrderHistoryLoadingState } from './OrderHistoryLoadingState';
import { CompletedOrderTimelineChart } from '../Charts';

export const AllCompletedOrdersChartSection =
  function AllCompletedOrdersChartSection({
    allOrdersMeta,
    allOrdersState,
    errorMessage,
    orders,
  }: {
    allOrdersMeta: string;
    allOrdersState: LoadState;
    errorMessage: string;
    orders: OrderPoint[];
  }) {
    return (
      <ChartCard title="Every completed order" meta={allOrdersMeta}>
        {allOrdersState === 'loading' ? (
          <OrderHistoryLoadingState
            message="Preparing the full completed order timeline..."
            variant="chart"
          />
        ) : (
          <>
            {errorMessage ? (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                {errorMessage}
              </Alert>
            ) : null}
            <CompletedOrderTimelineChart orders={orders} />
          </>
        )}
      </ChartCard>
    );
  };
