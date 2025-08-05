import React, { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';
import { Sun, Moon, Upload, Download, Search, X, LogIn, LogOut, Eye, EyeOff, FileText } from 'lucide-react';
import Papa from 'papaparse';

export type TransactionType = 'credit' | 'debit';
export type paymentModeType = 'cash' | 'online';
export type DBValue = Transaction | ConfigItem;

export interface Transaction {
  uuid: string;
  date: string;
  time: string;
  amount: number;
  type: TransactionType;
  paymentMode: paymentModeType;
  counterparty: string;
  remarks: string;
  refId?: string;
}

export interface ConfigItem {
  key: string;
  value: unknown;
}

export interface TransactionFormProps {
  onAddTransaction: (tx: Transaction) => void;
  counterpartys: string[];
}

export interface TooltipProps {
  text: string;
  children: ReactNode;
}

export interface SummaryWidgetProps {
  transactions: Transaction[];
}

export interface FormData {
  date: string;
  time: string;
  amount: number | string; // form input always provides string
  counterparty: string; // This will be mapped to 'counterparty'
  remarks: string;
  refId?: string;
  type: 'debit' | 'credit';
  paymentMode: 'cash' | 'online';
}

export interface Filters {
  startDate: string;
  endDate: string;
  type: 'all' | 'credit' | 'debit';
  paymentMode: 'cash' | 'online' | 'all';
  searchTerm: string;
}

export interface FilterControlsProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  counterpartys: string[];
  onExportCSV: () => void;
  onExportPDF: () => void;
  onImportCSV: (file: File) => void;
}

export interface TransactionListProps {
  transactions: Transaction[];
  loading: boolean;
  onDeleteCompleted: (deletedUuid: string) => void;
}

// types.ts or directly above the component
export interface LoginScreenProps {
  onLogin: (password: string) => Promise<boolean>;
  onSetPassword: (newPassword: string) => void;
  hasPassword: boolean;
}

export interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isOpen: boolean;
}

// --- Database Utility (IndexedDB) ---
const DB_NAME = 'TransactionDB';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';
const CONFIG_STORE_NAME = 'config';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'uuid' });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('time', 'time', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('paymentMode', 'paymentMode', { unique: false });
        store.createIndex('counterparty', 'counterparty', { unique: false });
        store.createIndex('remarks', 'remarks', { unique: false });
        store.createIndex('refId', 'refId', { unique: false });
      }

      if (!db.objectStoreNames.contains(CONFIG_STORE_NAME)) {
        db.createObjectStore(CONFIG_STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

const db = {
  async get<T = DBValue>(storeName: string, key: string): Promise<T | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
  },

  async set<T = DBValue>(storeName: string, value: T): Promise<IDBValidKey> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
  },

  async addTransaction(tx: Transaction): Promise<IDBValidKey> {
    return this.set<Transaction>(STORE_NAME, tx);
  },

  async getAllTransactions(): Promise<Transaction[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as Transaction[]);
      request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
  },

  async deleteTransaction(uuid: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(uuid);
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject((event.target as IDBRequest).error);
    });
  },
};

// --- Helper Functions ---
const formatDate = (date: string | number | Date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

const formatCurrentTime = () => {
  const now = new Date();
  return now.toTimeString().slice(0, 5);
}

const formatCurrency = (amount: number | bigint) => {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
};

// --- Components ---

const Tooltip: React.FC<TooltipProps> = ({ text, children }) => (
  <div className="relative group flex items-center">
    {children}
    <div className="absolute top-full mt-2 w-max bg-gray-700 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
      {text}
    </div>
  </div>
);

const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
        <div className='flex justify-center mb-4 gap-4'>
          <svg className='size-10 text-amber-600' viewBox="0 0 512 512" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
            <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
              <g id="add" fill="currentColor" transform="translate(32.000000, 42.666667)">
                <path d="M246.312928,5.62892705 C252.927596,9.40873724 258.409564,14.8907053 262.189374,21.5053731 L444.667042,340.84129 C456.358134,361.300701 449.250007,387.363834 428.790595,399.054926 C422.34376,402.738832 415.04715,404.676552 407.622001,404.676552 L42.6666667,404.676552 C19.1025173,404.676552 7.10542736e-15,385.574034 7.10542736e-15,362.009885 C7.10542736e-15,354.584736 1.93772021,347.288125 5.62162594,340.84129 L188.099293,21.5053731 C199.790385,1.04596203 225.853517,-6.06216498 246.312928,5.62892705 Z M224,272 C208.761905,272 197.333333,283.264 197.333333,298.282667 C197.333333,313.984 208.415584,325.248 224,325.248 C239.238095,325.248 250.666667,313.984 250.666667,298.624 C250.666667,283.264 239.238095,272 224,272 Z M245.333333,106.666667 L202.666667,106.666667 L202.666667,234.666667 L245.333333,234.666667 L245.333333,106.666667 Z" id="Combined-Shape">

                </path>
              </g>
            </g>
          </svg>
          <p className="text-gray-900 dark:text-gray-100 mb-6">{message}</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-400 dark:hover:bg-gray-600 transition font-semibold"
          >
            No, Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 flex gap-1 items-center justify-center px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 transition font-semibold"
          >
            Yes, Delete
          </button>
        </div>
      </div>
    </div>
  );
};

const SummaryWidget: React.FC<SummaryWidgetProps> = ({ transactions }) => {
  const summary = transactions.reduce(
    (acc, tx) => {
      if (tx.type === 'credit') {
        acc.credit += tx.amount;
      } else {
        acc.debit += tx.amount;
      }
      return acc;
    },
    { credit: 0, debit: 0 }
  );

  const totalAmount = summary.credit - summary.debit;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className='p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-xl space-y-4 border border-green-200 dark:border-green-800'>
        <div className='flex justify-between'>
          <p className="text-sm text-gray-500 dark:text-white">Total Credit</p>
          <svg className='size-8 text-green-600' viewBox="0 0 76 76" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" version="1.1" baseProfile="full" enable-background="new 0 0 76.00 76.00" xmlSpace="preserve">
            <path fill="currentColor" fill-opacity="1" stroke-width="0.1" stroke-linejoin="round" d="M 15.8332,47.5002L 15.8332,40.1901L 25.3332,31.6669L 30.0832,36.4169L 34.8331,20.5836L 44.3331,31.6669L 50.6664,25.3336L 45.9164,20.5836L 58.583,20.5836L 58.583,33.2502L 53.8331,28.5003L 44.3331,38.0002L 36.4165,28.5003L 31.6665,44.3335L 25.3332,38.0002L 15.8332,47.5002 Z " />
            <path fill="currentColor" fill-opacity="1" stroke-width="0.1" stroke-linejoin="round" d="M 58.5833,55.4167L 53.8333,55.4167L 53.8333,34.8333L 58.5833,39.5833L 58.5833,55.4167 Z M 49.0833,55.4167L 44.3333,55.4167L 44.3333,44.3333L 49.0833,39.5834L 49.0833,55.4167 Z M 39.5833,55.4167L 34.8333,55.4167L 34.8333,45.9167L 37.2083,36.4167L 39.5833,39.5833L 39.5833,55.4167 Z M 30.0833,55.4167L 25.3333,55.4167L 25.3333,44.3333L 30.0833,49.0833L 30.0833,55.4167 Z M 20.5833,55.4167L 15.8333,55.4167L 15.8333,53.8334L 20.5833,49.0834L 20.5833,55.4167 Z " />
          </svg>
        </div>
        <div>
          <p className="text-xl font-semibold text-green-600 dark:text-green-400">{formatCurrency(summary.credit)}</p>
          <p className="text-sm text-green-800 dark:text-green-300">Money Received</p>
        </div>
      </div>
      <div className='p-4 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 rounded-xl space-y-4 border border-red-200 dark:border-red-800'>
        <div className='flex justify-between'>
          <p className="text-sm text-gray-500 dark:text-white">Total Debit</p>
          <svg className='size-8 text-red-600' viewBox="0 0 76 76" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" version="1.1" baseProfile="full" enable-background="new 0 0 76.00 76.00" xmlSpace="preserve">
            <path fill="currentColor" fill-opacity="1" stroke-width="0.2" stroke-linejoin="round" d="M 58.5833,55.4167L 53.8333,55.4167L 53.8333,50.6667L 58.5833,50.6667L 58.5833,55.4167 Z M 49.0833,55.4167L 44.3333,55.4167L 44.3333,49.0833L 49.0833,50.6667L 49.0833,55.4167 Z M 39.5833,55.4167L 34.8333,55.4167L 34.8333,52.25L 39.5833,47.5L 39.5833,55.4167 Z M 30.0833,55.4167L 25.3333,55.4167L 25.3333,41.1667L 28.5,38L 30.0833,45.9167L 30.0833,55.4167 Z M 20.5833,55.4167L 15.8333,55.4167L 15.8333,33.25L 20.5833,38L 20.5833,55.4167 Z " />
            <path fill="currentColor" fill-opacity="1" stroke-width="0.2" stroke-linejoin="round" d="M 15.8332,20.5831L 15.8332,27.8932L 25.3332,36.4164L 30.0832,31.6664L 34.8332,47.4997L 44.3331,36.4164L 50.6664,42.7497L 45.9164,47.4997L 58.583,47.4997L 58.583,34.8331L 53.8331,39.5831L 44.3331,30.0831L 36.4165,39.5831L 31.6665,23.7498L 25.3332,30.0831L 15.8332,20.5831 Z " />
          </svg>
        </div>
        <div>
          <p className="text-xl font-semibold text-red-600 dark:text-red-400">{formatCurrency(summary.debit)}</p>
          <p className="text-sm text-red-800 dark:text-red-300">Money Paid</p>
        </div>
      </div>
      <div className='p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 rounded-xl space-y-4 border border-indigo-200 dark:border-indigo-800'>
        <div className='flex justify-between'>
          <p className="text-sm text-gray-500 dark:text-white">Total Amount</p>
          <svg fill="currentColor" className='size-8 text-indigo-600' version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink"
            viewBox="0 0 512 512" xmlSpace="preserve">
            <g>
              <g>
                <path d="M475.479,239.304H461.99c-4.674-8.934-10.282-17.51-16.771-25.641v-91.228c0-9.217-7.479-16.696-16.696-16.696
			c-32.109,0-60.641,18.163-74.576,45.859c-144.528-46.783-287.164,42.87-287.164,154.489h-7.826
			c-14.098,0-25.565-11.468-25.565-25.565V256c0-9.217-7.479-16.696-16.696-16.696S0,246.783,0,256v24.521
			c0,32.511,26.446,58.957,58.957,58.957h11.925c8.503,35.059,30.199,66.976,62.684,91.142v59.119
			c0,9.217,7.479,16.696,16.696,16.696h66.783c9.217,0,16.696-7.479,16.696-16.696V470.5c12.511,1.608,26.359,2.543,38.957,2.543
			s26.446-0.935,38.957-2.543v19.239c0,9.217,7.479,16.696,16.696,16.696h66.783c9.217,0,16.696-7.479,16.696-16.696V430.62
			c21.554-16.043,38.663-35.75,50.163-57.75h13.489c20.141,0,36.521-16.381,36.521-36.521v-60.522
			C512,255.685,495.619,239.304,475.479,239.304z M272.696,239.304c-28.554,0-59.913,8.706-78.043,21.663
			c-7.553,5.379-17.97,3.573-23.294-3.88c-5.358-7.5-3.62-17.924,3.88-23.294c23.707-16.935,61.956-27.881,97.457-27.881
			c9.217,0,16.696,7.479,16.696,16.696S281.913,239.304,272.696,239.304z M395.13,306.087c-9.22,0-16.696-7.475-16.696-16.696
			s7.475-16.696,16.696-16.696s16.696,7.475,16.696,16.696S404.351,306.087,395.13,306.087z"/>
              </g>
            </g>
            <g>
              <g>
                <path d="M133.565,5.565c-36.826,0-66.783,29.956-66.783,66.783s29.956,66.783,66.783,66.783c36.826,0,66.783-29.956,66.783-66.783
			S170.391,5.565,133.565,5.565z"/>
              </g>
            </g>
          </svg>
        </div>
        <div>
          <p className="text-xl font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(totalAmount)}</p>
          <p className="text-sm text-indigo-800 dark:text-indigo-300">Current Balance</p>
        </div>
      </div>
    </div>
  );
};

const TransactionForm: React.FC<TransactionFormProps> = ({ onAddTransaction, counterpartys }) => {

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      date: formatDate(new Date()),
      type: 'debit',
      paymentMode: 'cash',
      time: formatCurrentTime(),
    }
  });

  // Watch paymentMode to react to changes
  const paymentMode = watch('paymentMode');

  const onSubmit: SubmitHandler<FormData> = (data) => {
    const newTransaction: Transaction = {
      uuid: uuidv4(),
      date: data.date,
      time: data.time,
      amount: typeof data.amount === 'string' ? parseFloat(data.amount) : data.amount,
      type: data.type,
      paymentMode: data.paymentMode,
      counterparty: data.counterparty,
      remarks: data.remarks,
      refId: data.refId || undefined,
    };

    onAddTransaction(newTransaction);

    reset({
      date: formatDate(new Date()),
      time: formatCurrentTime(),
      amount: '',
      counterparty: '',
      remarks: '',
      refId: '',
      type: 'debit',
      paymentMode: 'cash'
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg transition duration-300">

      <div
        className="flex items-center justify-between w-full text-left px-4 py-3"
      >
        <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-white">
          Add New Transaction
        </h2>
      </div>

      <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Transaction Type
              </label>
              <select
                {...register("type", { required: true })}
                className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500  focus:ring-indigo-500"
                defaultValue=""
              >
                <option className='dark:bg-gray-800' value="" disabled>
                  Select Transaction Type
                </option>
                <option className='dark:bg-gray-800' value="debit">Debit (Paid)</option>
                <option className='dark:bg-gray-800' value="credit">Credit (Received)</option>
              </select>
            </div>
            <div className='w-full'>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
              <input
                type="date"
                {...register('date', { required: 'Date is required' })}
                className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500  focus:ring-indigo-500"
              />
              {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date.message}</p>}
            </div>
            <div className='w-full'>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time</label>
              <input
                type="time"
                {...register('time', { required: 'Time is required' })}
                className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500  focus:ring-indigo-500"
              />
              {errors.time && <p className="text-red-500 text-xs mt-1">{errors.time.message}</p>}
            </div>
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Payment Mode
              </label>
              <select
                {...register("paymentMode", { required: true })}
                className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500  focus:ring-indigo-500"
                defaultValue=""
              >
                <option className='dark:bg-gray-800' value="" disabled>
                  Select Transaction Type
                </option>
                <option className='dark:bg-gray-800' value="cash">Cash</option>
                <option className='dark:bg-gray-800' value="online">Online</option>
              </select>
            </div>
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                {...register('amount', {
                  required: 'Amount is required',
                  valueAsNumber: true,
                  min: {
                    value: 0.01,
                    message: 'Amount must be a positive number',
                  },
                })}
                placeholder="0.00"
                className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500 focus:ring-indigo-500"
              />
              {errors.amount && (
                <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reference ID {paymentMode === 'cash' && '(Optional)'}
              </label>
              <input
                type="text"
                {...register('refId', {
                  validate: value =>
                    paymentMode !== 'online' || (value && value.trim() !== '') || 'Reference ID is required for online payments'
                })}
                placeholder="e.g., INV-12345"
                className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500 focus:ring-indigo-500"
              />
              {errors.refId && <p className="text-red-500 text-xs mt-1">{errors.refId.message}</p>}

            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User (Paid to / Received from)</label>
            <input
              type="text"
              {...register('counterparty', { required: 'User is required' })}
              placeholder="e.g., John Doe, Supermarket"
              className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500  focus:ring-indigo-500"
              list="user-suggestions"
            />
            <datalist id="user-suggestions">
              {counterpartys.map((cp, i) => (
                <option key={i} value={cp} />
              ))}
            </datalist>
            {errors.counterparty && <p className="text-red-500 text-xs mt-1">{errors.counterparty.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Remarks</label>
            <textarea
              {...register('remarks', { required: 'Remarks are required' })}
              placeholder="e.g., Groceries, Salary"
              className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500  focus:ring-indigo-500"
            ></textarea>
            {errors.remarks && <p className="text-red-500 text-xs mt-1">{errors.remarks.message}</p>}
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-all duration-300 transform hover:scale-101"
          >
            Add Transaction
          </button>
        </form>
      </div>
    </div>
  );
};

const FilterControls: React.FC<FilterControlsProps> = ({
  filters,
  setFilters,
  onExportCSV,
  onExportPDF,
  onImportCSV,
}) => {
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportCSV(file);
      e.target.value = ''; // reset file selection for repeated imports
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl transition-all duration-300 space-y-4">
      <div className='flex flex-wrap justify-between items-center gap-4 mb-4'>
        <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-white">Filters</h2>

        {/* === Action Buttons === */}
        <div className="flex flex-wrap gap-2 pt-4">
          <input
            type="file"
            accept=".csv"
            ref={importInputRef}
            onChange={handleFileImport}
            className="hidden"
          />
          <button onClick={() => importInputRef.current?.click()} className="bg-transparent hover:bg-blue-500/30 rounded-lg flex items-center px-2 py-1">
            <Upload className="h-4 w-4 text-blue-500" /> <span className='pl-2 text-blue-500 hidden md:inline'>Import CSV</span>
          </button>
          <button onClick={onExportCSV} className="bg-transparent hover:bg-green-500/30 rounded-lg flex items-center px-2 py-1">
            <Download className="h-4 w-4 text-green-500" /> <span className='pl-2 text-green-500 hidden md:inline'>Export CSV</span>
          </button>
          <button onClick={onExportPDF} className="bg-transparent hover:bg-slate-500/20 rounded-lg flex items-center px-2 py-1">
            <FileText className="h-4 w-4 text-slate-500 dark:text-slate-200" /> <span className='pl-2 text-slate-500 dark:text-slate-200 hidden md:inline'>Export PDF</span>
          </button>
        </div>
      </div>

      {/* === Filters === */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date From</label>
          <input
            type="date"
            name="startDate"
            value={filters.startDate}
            onChange={handleInputChange}
            className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500  focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date To</label>
          <input
            type="date"
            name="endDate"
            value={filters.endDate}
            onChange={handleInputChange}
            className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500  focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
          <select
            name="type"
            value={filters.type}
            onChange={handleInputChange}
            className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500  focus:ring-indigo-500"
          >
            <option value="all" className='text-gray-600 dark:text-white dark:bg-gray-800'>All</option>
            <option value="credit" className='text-gray-600 dark:text-white dark:bg-gray-800'>Credit</option>
            <option value="debit" className='text-gray-600 dark:text-white dark:bg-gray-800'>Debit</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Mode</label>
          <select
            name="paymentMode"
            value={filters.paymentMode}
            onChange={handleInputChange}
            className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500  focus:ring-indigo-500"
          >
            <option value="all" className='text-gray-600 dark:text-white dark:bg-gray-800'>All</option>
            <option value="cash" className='text-gray-600 dark:text-white dark:bg-gray-800'>Cash</option>
            <option value="online" className='text-gray-600 dark:text-white dark:bg-gray-800'>Online</option>
          </select>
        </div>
      </div>

      {/* === Smart Search === */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Smart Search</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            name="searchTerm"
            value={filters.searchTerm}
            onChange={handleInputChange}
            placeholder="Search by Ref ID, User, remarks..."
            className="w-full mt-1 pl-10 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-0 focus:border-indigo-500  focus:ring-indigo-500"
          />
          {filters.searchTerm && (
            <X
              className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 cursor-pointer"
              onClick={() => setFilters(prev => ({ ...prev, searchTerm: '' }))}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const TransactionList: React.FC<TransactionListProps> = ({ transactions, loading, onDeleteCompleted }) => {
  const [visibleCount, setVisibleCount] = useState(15);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  const lastTransactionElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && visibleCount < transactions.length) {
          setVisibleCount((prev) => prev + 15);
        }
      });
      if (node) observer.current.observe(node);
    },
    [loading, visibleCount, transactions.length]
  );

  // Instead of deleting immediately, open the confirmation modal
  const confirmDelete = (uuid: string) => {
    setSelectedId(uuid);
    setIsConfirmOpen(true);
  };

  // Called when user confirms deletion in modal
  const handleDeleteConfirmed = async () => {
    if (!selectedId) return;
    try {
      await db.deleteTransaction(selectedId);
      onDeleteCompleted(selectedId);

      // For demo, you might want to just close modal:
      setIsConfirmOpen(false);
      setSelectedId(null);
    } catch (error) {
      console.error("Failed to delete transaction:", error);
      setIsConfirmOpen(false);
      setSelectedId(null);
    }
  };

  const cancelDelete = () => {
    setIsConfirmOpen(false);
    setSelectedId(null);
  };

  if (loading) {
    return (
      <div className="text-center p-10 text-gray-500 dark:text-gray-400">
        Loading transactions...
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center p-10 bg-white dark:bg-gray-800 rounded-xl">
        <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200">
          No Transactions Found
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Try adjusting your filters or add a new transaction.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden transition-all duration-300">
      <h1 className='text-lg sm:text-xl font-bold text-gray-800 dark:text-white mb-4'>Transactions ({transactions.length})</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1 overflow-y-auto">
        {transactions.slice(0, visibleCount).map((tx, index) => {
          const isLastElement = index === visibleCount - 1;
          return (
            <div
              key={tx.uuid || index}
              className='py-4 pe-4 space-y-2'
              ref={isLastElement ? lastTransactionElementRef : null}
            >
              <div className='border border-gray-300 dark:border-gray-700 rounded-3xl relative'>
                <p className='text-xs text-white bg-indigo-600 px-3 py-1 rounded-xl absolute top-[-15px] right-2 justify-self-end capitalize'>
                  {tx.paymentMode}
                </p>
                <div className='bg-white dark:bg-gray-800 rounded-3xl p-4'>
                  <div className='flex justify-between'>
                    <p className={`text-sm ${tx.type === 'debit' ? 'text-red-500 bg-red-100 dark:bg-red-900/50' : 'text-green-500 bg-green-100 dark:bg-green-900/50'} px-4 py-2 text-xs rounded-full text-center justify-self-center font-semibold`}>
                      {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                    </p>
                    <p className={tx.type === 'debit' ? 'text-red-500 text-right' : 'text-green-500 text-right'}>
                      {tx.type === 'debit' ? '-' : '+'}₹ {tx.amount}
                    </p>
                  </div>
                  <div className='space-y-1 pt-4'>
                    <p className='text-sm text-gray-500 dark:text-gray-400'>{tx.remarks}</p>
                    <p className='text-xs text-gray-300 dark:text-gray-600'>{tx.counterparty}</p>
                    {tx.refId && (
                      <p className='text-xs text-gray-300 dark:text-gray-600'>Ref. Id.: {tx.refId}</p>
                    )}
                  </div>
                </div>
                <div className='flex justify-between px-4 py-3'>
                  <p className='text-sm text-gray-500 dark:text-gray-400'>{tx.date} at {tx.time}</p>

                  <button
                    type='button'
                    onClick={() => confirmDelete(tx.uuid)}
                    className='p-1 px-2 text-sm text-red-500 hover:bg-red-600/10 rounded-full hover:text-red-600 dark:text-red-400 dark:hover:text-red-500'
                  >
                    Delete
                  </button>

                </div>
              </div>
            </div>
          );
        })}
      </div>
      {visibleCount < transactions.length && (
        <div className="text-center p-4">
          <button
            onClick={() => setVisibleCount((prev) => prev + 15)}
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Load More
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        message="Are you sure you want to delete this transaction?"
        onConfirm={handleDeleteConfirmed}
        onCancel={cancelDelete}
      />
    </div>
  );
};

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onSetPassword, hasPassword }) => {
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onLogin(password);
    if (!success) {
      setError('Incorrect password');
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleSetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    onSetPassword(newPassword);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-8 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Transaction Flow</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {hasPassword
              ? 'Please enter your password to continue.'
              : 'Welcome! Please set a password to secure your data.'}
          </p>
        </div>

        {hasPassword ? (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="flex items-end mt-1">
              <div className='w-full'>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  placeholder='Type your password here...'
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-indigo-500  focus:ring-indigo-500"
                  required
                />
              </div>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="p-3 flex items-center text-sm leading-5"
              >
                {showPassword ? <EyeOff className="h-5 w-5 text-gray-500" /> : <Eye className="h-5 w-5 text-gray-500" />}
              </button>
            </div>
            <button
              type="submit"
              className="w-full flex justify-center items-center bg-indigo-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-0 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-all duration-300"
            >
              <LogIn className="h-5 w-5 mr-2" /> Login
            </button>
          </form>
        ) : (
          <form onSubmit={handleSetPassword} className="space-y-6">
            <div className="flex items-end mt-1">
              <div className='w-full'>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  placeholder='Type New Password'
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:outline-none focus:border-indigo-500  focus:ring-indigo-500"
                  required
                />
              </div>
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="p-3 flex items-center text-sm leading-5"
              >
                {showNewPassword ? <EyeOff className="h-5 w-5 text-gray-500" /> : <Eye className="h-5 w-5 text-gray-500" />}
              </button>
            </div>
            <div className="flex items-end mt-1">
              <div className='w-full'>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm Password</label>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  placeholder='Re-type New Password'
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full mt-1 p-2 rounded-lg text-gray-900 bg-transparent dark:text-white placeholder-gray-400 dark:placeholder-gray-600 border border-gray-300 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-500"
                  required
                />
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="p-3 flex items-center text-sm leading-5"
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5 text-gray-500" /> : <Eye className="h-5 w-5 text-gray-500" />}
              </button>
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-all duration-300"
            >
              Set Password & Start
            </button>
          </form>
        )}

        {error && <p className="text-center text-red-500 text-sm mt-4">{error}</p>}
      </div>
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'transactions' | 'add'>('transactions');
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    startDate: '',
    endDate: '',
    type: 'all',
    paymentMode: 'all',
    searchTerm: '',
  });
  const [uniqueUsers, setUniqueUsers] = useState<string[]>([]);

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(() => {
    // Check for password on initial load
    const checkPassword = async () => {
      const storedHash = await db.get(CONFIG_STORE_NAME, 'passwordHash');
      setHasPassword(!!storedHash);
    };
    checkPassword();
  }, []);

  // Load saved theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Toggle handler
  const toggleDarkMode = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    if (newTheme) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const fetchData = async () => {
    if (!isAuthenticated) return;
    setLoading(true);

    try {
      const data: Transaction[] = await db.getAllTransactions();

      // Sort by date descending
      const sortedData = data.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setAllTransactions(sortedData);

      // Extract unique counterparties (users)
      const users = [...new Set(data.map(tx => tx.counterparty))];
      setUniqueUsers(users);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAuthenticated]);

  useEffect(() => {
    let filtered = [...allTransactions];

    if (filters.startDate) {
      filtered = filtered.filter(tx => new Date(tx.date) >= new Date(filters.startDate));
    }
    if (filters.endDate) {
      filtered = filtered.filter(tx => new Date(tx.date) <= new Date(filters.endDate));
    }
    if (filters.type !== 'all') {
      filtered = filtered.filter(tx => tx.type === filters.type);
    }
    if (filters.paymentMode !== 'all') {
      filtered = filtered.filter(tx => tx.paymentMode === filters.paymentMode);
    }
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(tx =>
        (tx.remarks && tx.remarks.toLowerCase().includes(term)) ||
        (tx.uuid && tx.uuid.toLowerCase().includes(term)) ||
        (tx.refId && tx.refId.toLowerCase().includes(term)) ||
        (tx.counterparty && tx.counterparty.toLowerCase().includes(term))
      );
    }

    setTransactions(filtered);
  }, [filters, allTransactions]);

  const handleAddTransaction: (newTransaction: Transaction) => Promise<void> = async (newTransaction) => {
    await db.addTransaction(newTransaction);
    fetchData(); // Refetch all data
  };

  const handleDeleteCompleted = (deletedUuid: string) => {
    setTransactions(prev => prev.filter(tx => tx.uuid !== deletedUuid));
  };

  // --- Auth Handlers ---
  const handleSetPassword: (newPassword: string) => Promise<void> = async (password) => {
    // In a real app, use a proper hashing library like bcrypt.
    // For this client-side example, a simple approach is used.
    const hash = btoa(password); // Simple encoding, not true hashing
    await db.set(CONFIG_STORE_NAME, { key: 'passwordHash', value: hash });
    setHasPassword(true);
    setIsAuthenticated(true);
  };

  const handleLogin = async (password: string) => {
    const storedHash = await db.get(CONFIG_STORE_NAME, 'passwordHash');

    const hash = btoa(password);

    if (storedHash && 'value' in storedHash) {
      if (storedHash.value === hash) {
        setIsAuthenticated(true);
        return true;
      }
    }

    return false;
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  // --- Data Handlers ---
  const handleExportCSV = () => {
    const headers: (keyof Transaction)[] = [
      'uuid',
      'date',
      'time',
      'paymentMode',
      'type',
      'amount',
      'counterparty',
      'remarks',
      'refId',
    ];

    const csvRows = [
      headers.join(','), // the header row as a string
      ...transactions.map((tx) =>
        headers.map((header) => `"${tx[header] ?? ''}"`).join(',')
      ),
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${formatDate(new Date())}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  };

  const handleImportCSV = (file: File) => {
    const reader = new FileReader();

    reader.onload = async (event: ProgressEvent<FileReader>) => {
      const csv = event.target?.result as string;

      Papa.parse(csv, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          for (const row of results.data as any[]) {
            const {
              uuid,
              date,
              time,
              type,
              paymentMode,
              amount,
              counterparty,
              remarks,
              refId = '',
            } = row;

            if (uuid && date && time && type && paymentMode && amount && counterparty && remarks) {
              const tx = {
                uuid,
                date,
                time,
                type: type.toLowerCase() as 'credit' | 'debit',
                paymentMode: paymentMode.toLowerCase() as 'cash' | 'online',
                amount: parseFloat(amount),
                counterparty,
                remarks,
                refId,
              };

              await db.addTransaction(tx);
            }
          }

          fetchData();
        },
      });
    };

    reader.readAsText(file);
  };

  const handleExportPDF = async () => {
    const loadScript = (src: string): Promise<void> => new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        return resolve();
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve(); // ✅ fix here
      script.onerror = () => reject(new Error(`Script load error for ${src}`));
      document.head.appendChild(script);
    });

    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');

      const { jsPDF } = (window as any).jspdf;
      const doc = new jsPDF();

      // Title
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text("Transaction Report", 14, 16);

      // Subtitle
      doc.setFontSize(10);
      doc.setTextColor(102, 51, 153); // Indigo-like color
      doc.text("by Transaction Flow", 14, 23);

      // Table
      doc.autoTable({
        startY: 30,
        head: [['Date', 'Time', 'Payment Mode', 'Type', 'Ref ID', 'User', 'Remarks', 'Amount']],
        body: transactions.map(tx => [
          formatDate(tx.date),
          tx.time,
          tx.paymentMode,
          tx.type,
          { content: tx.refId || '-', styles: { halign: 'center' } },
          { content: tx.counterparty, styles: { halign: 'left' } },
          { content: tx.remarks, styles: { halign: 'left' } },
          {
            content: formatCurrency(tx.amount).replace('₹', ''),
            styles: {
              halign: 'right',
              textColor: tx.type === 'credit' ? [40, 167, 69] : [220, 53, 69]
            }
          }
        ]),
        styles: {
          fontSize: 8,
          cellWidth: 'wrap',
        },
        columnStyles: {
          7: { cellWidth: 25 }, // Amount column fixed width
          4: { cellWidth: 20 }, // Ref ID
          5: { cellWidth: 30 }, // User
          6: { cellWidth: 40 }, // Remarks
        },
        didDrawPage: function (data:any) {
          const pageCount = doc.internal.getNumberOfPages();
          doc.setFontSize(9);
          doc.setTextColor(150);
          doc.text(`Page ${pageCount}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
        },
      });

      doc.save(`transactions_${formatDate(new Date())}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
    }
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} onSetPassword={handleSetPassword} hasPassword={hasPassword} />;
  }

  return (
    <div className="bg-gray-100 dark:bg-gray-900 min-h-screen font-sans text-gray-900 dark:text-gray-100 transition-colors duration-300">
      <header className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg sticky top-0 z-10 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-lg sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">Transaction Flow</h1>
            <div className="flex items-center space-x-2">
              <Tooltip text={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
                <button
                  onClick={toggleDarkMode}
                  className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {isDarkMode ? (
                    <Sun className="size-5 text-yellow-400" />
                  ) : (
                    <Moon className="h-6 w-6 text-gray-700" />
                  )}
                </button>
              </Tooltip>
              <Tooltip text="Logout">
                <button onClick={handleLogout} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  <LogOut className="size-5 text-red-500" />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        <div className='flex items-center justify-center'>
          <div className='flex items-center justify-center gap-1 border border-gray-200 dark:border-gray-700 rounded-full'>
            {/* Transactions Tab */}
            <div
              onClick={() => setActiveTab('transactions')}
              className={`cursor-pointer flex items-center gap-1 px-4 p-2 rounded-full transition-colors
      ${activeTab === 'transactions'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white'}
    `}
            >
              <svg className='size-6' viewBox="0 0 24 24" fill="none">
                <path d="M8 8H20M11 12H20M14 16H20M4 8H4.01M7 12H7.01M10 16H10.01" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className='text-sm'>Transactions</p>
            </div>

            {/* Add Tab */}
            <div
              onClick={() => setActiveTab('add')}
              className={`cursor-pointer flex items-center gap-1 px-4 p-2 rounded-full transition-colors
              ${activeTab === 'add'
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white'}
              `}
            >
              <svg className='size-6' viewBox="0 0 24 24" fill="none">
                <path d="M6 12H12M12 12H18M12 12V18M12 12V6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className='text-sm'>Add New</p>
            </div>
          </div>
        </div>

        {activeTab === 'transactions' && (
          <>
            <SummaryWidget transactions={transactions} />
            <FilterControls
              filters={filters}
              setFilters={setFilters}
              counterpartys={uniqueUsers}
              onExportCSV={handleExportCSV}
              onImportCSV={handleImportCSV}
              onExportPDF={handleExportPDF}
            />
            <TransactionList
              transactions={transactions}
              loading={loading}
              onDeleteCompleted={handleDeleteCompleted}
            />
          </>
        )}

        {activeTab === 'add' && (
          <TransactionForm onAddTransaction={handleAddTransaction} counterpartys={uniqueUsers} />
        )}

      </main>
    </div>
  );
}