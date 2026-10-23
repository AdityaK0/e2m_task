import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import {
  customersApi,
  type BulkAssignmentPayload,
  type CustomerPayload,
} from "@/lib/api/customers";
import type { Customer } from "@/lib/api/types";

async function refreshAllCustomers(): Promise<Customer[]> {
  const customers: Customer[] = [];
  let page = 1;
  let pages = 1;
  do {
    const result = await customersApi.list({ page, page_size: 100 });
    customers.push(...result.items);
    pages = result.pages;
    page += 1;
  } while (page <= pages);
  return customers;
}

export const createCustomer = createAsyncThunk(
  "customers/create",
  (payload: CustomerPayload) => customersApi.create(payload),
);
export const updateCustomer = createAsyncThunk(
  "customers/update",
  ({ id, payload }: { id: number; payload: Partial<CustomerPayload> }) =>
    customersApi.update(id, payload),
);
export const deleteCustomer = createAsyncThunk(
  "customers/delete",
  async (id: number) => {
    await customersApi.remove(id);
    return id;
  },
);
export const assignCustomerManager = createAsyncThunk(
  "customers/assignManager",
  async ({ customerId, managerId }: { customerId: number; managerId: number }) => {
    await customersApi.assignManager(customerId, managerId);
    return customersApi.get(customerId);
  },
);
export const unassignCustomerManager = createAsyncThunk(
  "customers/unassignManager",
  async ({ customerId, managerId }: { customerId: number; managerId: number }) => {
    await customersApi.unassignManager(customerId, managerId);
    return customersApi.get(customerId);
  },
);
export const bulkAssignCustomers = createAsyncThunk(
  "customers/bulkAssign",
  async (payload: BulkAssignmentPayload) => {
    const result = await customersApi.bulkAssign(payload);
    return { result, customers: await refreshAllCustomers() };
  },
);
export const bulkUnassignCustomers = createAsyncThunk(
  "customers/bulkUnassign",
  async (payload: BulkAssignmentPayload) => {
    const result = await customersApi.bulkUnassign(payload);
    return { result, customers: await refreshAllCustomers() };
  },
);

interface CustomersState {
  items: Customer[];
}

const initialState: CustomersState = { items: [] };

const customersSlice = createSlice({
  name: "customers",
  initialState,
  reducers: {
    setCustomers(state, action: { payload: Customer[] }) {
      state.items = action.payload;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(createCustomer.fulfilled, (state, action) => {
        state.items = [action.payload, ...state.items.filter((item) => item.id !== action.payload.id)];
      })
      .addCase(updateCustomer.fulfilled, (state, action) => {
        state.items = state.items.map((item) => item.id === action.payload.id ? action.payload : item);
      })
      .addCase(deleteCustomer.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
      })
      .addCase(assignCustomerManager.fulfilled, (state, action) => {
        state.items = state.items.map((item) => item.id === action.payload.id ? action.payload : item);
      })
      .addCase(unassignCustomerManager.fulfilled, (state, action) => {
        state.items = state.items.map((item) => item.id === action.payload.id ? action.payload : item);
      })
      .addCase(bulkAssignCustomers.fulfilled, (state, action) => {
        state.items = action.payload.customers;
      })
      .addCase(bulkUnassignCustomers.fulfilled, (state, action) => {
        state.items = action.payload.customers;
      });
  },
});

export const { setCustomers } = customersSlice.actions;
export default customersSlice.reducer;
