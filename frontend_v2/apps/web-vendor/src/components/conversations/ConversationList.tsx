import { useState, useMemo } from 'react';
import { Input, Button, Modal } from '@chatlogix/ui';
import { ConversationListItem } from './ConversationListItem';
import type { Conversation } from './types';

export interface ConversationFilters {
  aiPauseStatus: 'all' | 'paused' | 'active';
  hasOrder: 'all' | 'yes' | 'no';
  customerType: 'all' | 'regular' | 'new';
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectConversation: (conversation: Conversation) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  error: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  filters?: ConversationFilters;
  onFiltersChange?: (filters: ConversationFilters) => void;
}

export function ConversationList({
  conversations,
  selectedConversationId,
  searchQuery,
  onSearchChange,
  onSelectConversation,
  isRefreshing,
  onRefresh,
  error,
  hasMore,
  isLoadingMore,
  onLoadMore,
  filters: externalFilters,
  onFiltersChange,
}: Readonly<ConversationListProps>) {
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<ConversationFilters>({
    aiPauseStatus: 'all',
    hasOrder: 'all',
    customerType: 'all',
  });

  const filters = externalFilters || localFilters;

  const hasActiveFilters = useMemo(() => {
    return (
      filters.aiPauseStatus !== 'all' ||
      filters.hasOrder !== 'all' ||
      filters.customerType !== 'all'
    );
  }, [filters]);

  const handleFilterChange = (key: keyof ConversationFilters, value: ConversationFilters[keyof ConversationFilters]) => {
    const newFilters = { ...filters, [key]: value };
    if (onFiltersChange) {
      onFiltersChange(newFilters);
    } else {
      setLocalFilters(newFilters);
    }
    // Don't close modal automatically - let user close manually
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      aiPauseStatus: 'all' as const,
      hasOrder: 'all' as const,
      customerType: 'all' as const,
    };
    if (onFiltersChange) {
      onFiltersChange(clearedFilters);
    } else {
      setLocalFilters(clearedFilters);
    }
    // Don't close modal automatically - let user close manually
  };

  const hasConversations = conversations.length > 0;

  return (
    <div
      className="w-full lg:max-w-md bg-white border-r border-black/10 flex flex-col h-full"
      role="navigation"
      aria-label="Conversations list"
    >
      {/* Header with search */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <h2 className="text-xs sm:text-sm font-semibold text-gray-900">Conversations</h2>
        </div>
        <div className="flex items-center space-x-1 sm:space-x-2">
          <Button
            variant="ghost"
            size="sm"
            className={`text-gray-600 hover:bg-gray-100 text-xs sm:text-sm relative ${
              hasActiveFilters ? 'bg-blue-50 text-blue-600' : ''
            }`}
            onClick={() => setIsFilterModalOpen(true)}
            title="Filter conversations"
          >
            <svg
              className="w-4 h-4 sm:w-5 sm:h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-blue-600 rounded-full"></span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-600 hover:bg-gray-100 text-xs sm:text-sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh conversations"
          >
            {isRefreshing ? '⟳' : '↻'}
          </Button>
        </div>
      </div>

      <div className="px-2 sm:px-3 py-2 sm:py-2.5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-2 sm:px-3 py-1.5">
          <svg
            className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <Input
            type="text"
            placeholder="Search by name or phone"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 border-0 px-0 text-xs sm:text-sm bg-transparent text-gray-900 placeholder:text-gray-400"
            aria-label="Search conversations by name or phone"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="text-gray-400 hover:text-gray-600 text-[10px] sm:text-xs"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Conversation List */}
      <div
        className="flex-1 overflow-y-auto bg-white"
        role="listbox"
        aria-label="Conversation threads"
      >
        {error && (
          <div className="p-4 bg-red-50 border-b border-red-200">
            <div className="text-red-800 text-sm mb-2">{error}</div>
            <Button size="sm" variant="ghost" onClick={onRefresh}>
              Retry
            </Button>
          </div>
        )}
        {!hasConversations && !isRefreshing ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            <p>No conversations found</p>
          </div>
        ) : (
          conversations.map((conversation) => (
            <ConversationListItem
              key={conversation.id}
              conversation={conversation}
              isSelected={selectedConversationId === conversation.id}
              onClick={() => onSelectConversation(conversation)}
            />
          ))
        )}
        {hasMore && (
          <div className="p-3 flex justify-center border-t border-gray-200 bg-white">
            <Button
              size="sm"
              variant="ghost"
              onClick={onLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>

      {/* Filter Modal */}
      <Modal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title="Filter Conversations"
        size="sm"
      >
        <div className="space-y-6">
          {/* Clear Filters Button - At Top */}
          <div className="pb-2 ">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              disabled={!hasActiveFilters}
            >
              Clear All Filters
            </Button>
          </div>

          {/* AI Pause Status Filter */}
          <div>
            <div className="block text-sm font-medium text-gray-700 mb-2">
              AI Auto-Reply Status
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'active', 'paused'] as const).map((status) => (
                <label
                  key={status}
                  className="flex items-center space-x-2 cursor-pointer px-3 py-1.5 rounded-md hover:bg-gray-50"
                >
                  <input
                    type="radio"
                    name="aiPauseStatus"
                    checked={filters.aiPauseStatus === status}
                    onChange={() => handleFilterChange('aiPauseStatus', status)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 whitespace-nowrap">
                    {status === 'all' && 'All'}
                    {status === 'active' && '▶ AI Active'}
                    {status === 'paused' && '⏸ AI Paused'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Has Order Filter */}
          <div>
            <div className="block text-sm font-medium text-gray-700 mb-2">
              Order Status
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'yes', 'no'] as const).map((status) => (
                <label
                  key={status}
                  className="flex items-center space-x-2 cursor-pointer px-3 py-1.5 rounded-md hover:bg-gray-50"
                >
                  <input
                    type="radio"
                    name="hasOrder"
                    checked={filters.hasOrder === status}
                    onChange={() => handleFilterChange('hasOrder', status)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 whitespace-nowrap">
                    {status === 'all' && 'All'}
                    {status === 'yes' && 'Has Orders'}
                    {status === 'no' && 'No Orders'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Customer Type Filter */}
          <div>
            <div className="block text-sm font-medium text-gray-700 mb-2">
              Customer Type
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'regular', 'new'] as const).map((type) => (
                <label
                  key={type}
                  className="flex items-center space-x-2 cursor-pointer px-3 py-1.5 rounded-md hover:bg-gray-50"
                >
                  <input
                    type="radio"
                    name="customerType"
                    checked={filters.customerType === type}
                    onChange={() => handleFilterChange('customerType', type)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 whitespace-nowrap">
                    {type === 'all' && 'All'}
                    {type === 'regular' && 'Regular Customers'}
                    {type === 'new' && 'New Customers'}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

