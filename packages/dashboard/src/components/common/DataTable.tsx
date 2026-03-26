import React, { useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import clsx from 'clsx';

export interface Column<T = any> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
}

interface DataTableProps<T = any> {
  columns: Column<T>[];
  data: T[];
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export const DataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  onSort,
  onRowClick,
  emptyMessage = 'No data available',
}) => {
  const [sortState, setSortState] = useState<SortState | null>(null);

  const handleSort = (columnKey: string) => {
    if (sortState?.key === columnKey) {
      const newDir = sortState.dir === 'asc' ? 'desc' : 'asc';
      setSortState({ key: columnKey, dir: newDir });
      onSort?.(columnKey, newDir);
    } else {
      setSortState({ key: columnKey, dir: 'asc' });
      onSort?.(columnKey, 'asc');
    }
  };

  const getValue = (row: any, key: string): any => {
    return key.split('.').reduce((obj, k) => obj?.[k], row);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            {columns.map((column) => (
              <th
                key={column.key}
                className={clsx(
                  'px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300',
                  column.sortable && 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <div className="flex items-center gap-2">
                  <span>{column.label}</span>
                  {column.sortable && sortState?.key === column.key && (
                    <div className="text-slate-500 dark:text-slate-400">
                      {sortState.dir === 'asc' ? (
                        <ArrowUp size={14} />
                      ) : (
                        <ArrowDown size={14} />
                      )}
                    </div>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={clsx(
                  'border-b border-slate-100 dark:border-slate-800',
                  rowIndex % 2 === 0 && 'bg-slate-50 dark:bg-slate-950',
                  onRowClick && 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900'
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column) => (
                  <td
                    key={`${rowIndex}-${column.key}`}
                    className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300"
                  >
                    {column.render
                      ? column.render(getValue(row, column.key), row)
                      : getValue(row, column.key)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
