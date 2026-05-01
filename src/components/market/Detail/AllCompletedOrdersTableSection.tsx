import {
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
} from '@mui/material';

import {
  formatStubs,
  type LoadState,
  type OrderPoint,
} from '../../../marketUtils';
import { SectionHeading } from '../common';
import { AllCompletedOrdersLoadPrompt } from './AllCompletedOrdersLoadPrompt';
import { OrderHistoryLoadingState } from './OrderHistoryLoadingState';

export function AllCompletedOrdersTableSection({
  allCompletedOrdersDescending,
  allOrdersMeta,
  allOrdersState,
  completedOrderRowsPerPage,
  errorMessage,
  paginatedAllCompletedOrders,
  safeCompletedOrderPage,
  setCompletedOrderPage,
  setCompletedOrderRowsPerPage,
  onLoadAllOrders,
}: {
  allCompletedOrdersDescending: OrderPoint[];
  allOrdersMeta: string;
  allOrdersState: LoadState;
  completedOrderRowsPerPage: number;
  errorMessage: string;
  paginatedAllCompletedOrders: OrderPoint[];
  safeCompletedOrderPage: number;
  setCompletedOrderPage: (value: number) => void;
  setCompletedOrderRowsPerPage: (value: number) => void;
  onLoadAllOrders: () => void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.75 }}>
      <SectionHeading title="All completed orders" meta={allOrdersMeta} />
      {allOrdersState === 'idle' ? (
        <AllCompletedOrdersLoadPrompt
          onLoad={onLoadAllOrders}
          variant="table"
        />
      ) : allOrdersState === 'loading' ? (
        <OrderHistoryLoadingState
          message="Loading long-term completed order history..."
          variant="table"
        />
      ) : (
        <>
          {errorMessage ? (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              {errorMessage}
            </Alert>
          ) : null}
          <TableContainer sx={{ maxHeight: 360 }}>
            <Table stickyHeader size="small" aria-label="All completed orders">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell align="right">Price</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedAllCompletedOrders.map((order, index) => (
                  <TableRow
                    key={`${order.label}-${order.price}-${safeCompletedOrderPage}-${index}`}
                  >
                    <TableCell>{order.label}</TableCell>
                    <TableCell align="right">
                      {formatStubs(order.price)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={allCompletedOrdersDescending.length}
            onPageChange={(_event, page) => setCompletedOrderPage(page)}
            onRowsPerPageChange={(event) => {
              setCompletedOrderRowsPerPage(Number(event.target.value));
              setCompletedOrderPage(0);
            }}
            page={safeCompletedOrderPage}
            rowsPerPage={completedOrderRowsPerPage}
            rowsPerPageOptions={[25, 50, 100, 250]}
          />
        </>
      )}
    </Paper>
  );
}
