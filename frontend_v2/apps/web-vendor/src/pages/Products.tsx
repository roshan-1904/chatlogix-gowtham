/**
 * Products list page
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '@chatlogix/ui';
import { useProducts } from '../hooks/products/useProducts';
import { ProductList } from '../components/products/ProductList';
import { ProductFilters } from '../components/products/ProductFilters';
import { getCategories } from '../lib/products';
import { useCatalogImportEnabled, useVendorConfig } from '../hooks/useVendorConfig';
import { EntryPickerModal } from '../components/catalogImport/EntryPickerModal';
import { isTemplateAvailable, listJobs } from '../lib/catalogImport';
import type { JobListEntry } from '../types/catalogImport';

const VIEW_MODE_STORAGE_KEY = 'productListViewMode';

export function Products() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return (saved as 'table' | 'grid') || 'table';
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [bulkAction, setBulkAction] = useState<'activate' | 'deactivate' | 'delete' | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [templateAvailable, setTemplateAvailable] = useState(false);
  const [deferredJobs, setDeferredJobs] = useState<JobListEntry[]>([]);
  const importEnabled = useCatalogImportEnabled();
  const { data: vendor } = useVendorConfig();

  const {
    products,
    total,
    page,
    pageSize,
    loading,
    error,
    filters,
    setFilters,
    refetch,
    deleteProductById,
    bulkUpdate,
  } = useProducts({
    initialFilters: {
      page: 1,
      pageSize: 20,
      isActive: true,
    },
  });

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  // Fetch categories independently
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const fetchedCategories = await getCategories();
        setCategories(fetchedCategories);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
        setCategories([]);
      }
    };

    fetchCategories();
  }, []);

  useEffect(() => {
    if (!importEnabled) return;
    const category = vendor?.category?.trim().toLowerCase();
    if (!category) {
      setTemplateAvailable(false);
      return;
    }
    isTemplateAvailable(category)
      .then(setTemplateAvailable)
      .catch(() => setTemplateAvailable(false));
  }, [importEnabled, vendor?.category]);

  useEffect(() => {
    if (!importEnabled) return;
    listJobs('has_deferred')
      .then((res) => setDeferredJobs(res.jobs))
      .catch(() => setDeferredJobs([]));
  }, [importEnabled]);

  const handleEdit = (id: string) => {
    navigate(`/catalog/${id}/edit`);
  };

  const handleDelete = (id: string) => {
    const product = products.find(p => p.id === id);
    if (product) {
      setDeleteConfirm({ id, name: product.name });
    }
  };

  const confirmDelete = async () => {
    if (deleteConfirm) {
      try {
        await deleteProductById(deleteConfirm.id);
        setDeleteConfirm(null);
        await refetch();
      } catch (error) {
        console.error('Failed to delete product:', error);
        alert('Failed to delete product. Please try again.');
      }
    }
  };

  const handleToggleStatus = async (id: string, isActive: boolean) => {
    try {
      await bulkUpdate(isActive ? 'activate' : 'deactivate', [id]);
      await refetch();
    } catch (error) {
      console.error('Failed to toggle status:', error);
      alert('Failed to update product status. Please try again.');
    }
  };

  const handleBulkAction = async () => {
    if (bulkAction && selectedIds.length > 0) {
      try {
        await bulkUpdate(bulkAction, selectedIds);
        setSelectedIds([]);
        setBulkAction(null);
        await refetch();
      } catch (error) {
        console.error('Failed to perform bulk action:', error);
        alert('Failed to perform bulk action. Please try again.');
      }
    }
  };

  return (
    <div className="p-1  space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Product Catalog</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
          {importEnabled && (
            <Button
              variant="secondary"
              onClick={() => setPickerOpen(true)}
              className="w-full sm:w-auto"
            >
              Smart Import
            </Button>
          )}
          <Button onClick={() => navigate('/catalog/new')} className="w-full sm:w-auto">
            Add Product
          </Button>
        </div>
      </div>

      {importEnabled && deferredJobs.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {deferredJobs.reduce((acc, j) => acc + j.deferredCount, 0)} product
            {deferredJobs.reduce((acc, j) => acc + j.deferredCount, 0) === 1 ? '' : 's'} from
            a recent import {deferredJobs.length === 1 ? 'is' : 'are'} waiting for
            review.
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/catalog/import?jobId=${deferredJobs[0].id}`)}
          >
            Review now
          </Button>
        </div>
      )}

      {/* Filters */}
      <ProductFilters
        filters={filters}
        onChange={setFilters}
        categories={categories}
      />

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2 p-3 bg-gray-100 border border-gray-300 rounded-lg">
          <span className="text-xs sm:text-sm text-gray-700">
            {selectedIds.length} product{selectedIds.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setBulkAction('activate');
                handleBulkAction();
              }}
              className="text-xs sm:text-sm"
            >
              Activate
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setBulkAction('deactivate');
                handleBulkAction();
              }}
              className="text-xs sm:text-sm"
            >
              Deactivate
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (confirm('Are you sure you want to delete selected products?')) {
                  setBulkAction('delete');
                  handleBulkAction();
                }
              }}
              className="text-xs sm:text-sm"
            >
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
              className="text-xs sm:text-sm"
            >
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg text-sm sm:text-base text-red-700">
          {error}
        </div>
      )}

      {/* Product List */}
      <ProductList
        products={products}
        total={total}
        page={page}
        pageSize={pageSize}
        loading={loading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleStatus={handleToggleStatus}
        onPageChange={(newPage) => setFilters({ ...filters, page: newPage })}
        onPageSizeChange={(newPageSize) => setFilters({ ...filters, pageSize: newPageSize, page: 1 })}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      <EntryPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        templateAvailable={templateAvailable}
        categoryLabel={vendor?.category}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal
          isOpen={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Product"
        >
          <div className="space-y-4">
            <p>
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
            </p>
            <p className="text-sm text-gray-500">
              This action cannot be undone. The product will be deactivated.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
