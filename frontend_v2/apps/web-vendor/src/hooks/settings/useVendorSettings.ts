import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@chatlogix/auth';
import {
  getBusinessInfo,
  getAIConfig,
  getOrderSettings,
  getNotificationSettings,
  getMatchingConfig,
  updateBusinessInfo,
  updateAIConfig,
  updateOrderSettings,
  updateNotificationSettings,
  updateMatchingConfig,
  updateTimezone,
} from '../../api/settings';
import type {
  BusinessInfoUpdate,
  AIConfigUpdate,
  OrderSettingsUpdate,
  NotificationSettings,
  MatchingConfig,
  TimezoneSettings,
} from '../../types/settings';

export function useVendorSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const vendorId = user?.vendorId;

  // Business Info
  const businessInfoQuery = useQuery({
    queryKey: ['vendor', vendorId, 'business-info'],
    queryFn: () => getBusinessInfo(vendorId!),
    enabled: !!vendorId,
  });

  const updateBusinessInfoMutation = useMutation({
    mutationFn: (data: BusinessInfoUpdate) => updateBusinessInfo(vendorId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId, 'business-info'] });
    },
  });

  // AI Config
  const aiConfigQuery = useQuery({
    queryKey: ['vendor', vendorId, 'ai-config'],
    queryFn: () => getAIConfig(vendorId!),
    enabled: !!vendorId,
  });

  const updateAIConfigMutation = useMutation({
    mutationFn: (data: AIConfigUpdate) => updateAIConfig(vendorId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId, 'ai-config'] });
    },
  });

  // Order Settings
  const orderSettingsQuery = useQuery({
    queryKey: ['vendor', vendorId, 'order-settings'],
    queryFn: () => getOrderSettings(vendorId!),
    enabled: !!vendorId,
  });

  const updateOrderSettingsMutation = useMutation({
    mutationFn: (data: OrderSettingsUpdate) => updateOrderSettings(vendorId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId, 'order-settings'] });
    },
  });

  // Notification Settings
  const notificationSettingsQuery = useQuery({
    queryKey: ['vendor', vendorId, 'notification-settings'],
    queryFn: () => getNotificationSettings(vendorId!),
    enabled: !!vendorId,
  });

  const updateNotificationSettingsMutation = useMutation({
    mutationFn: (data: NotificationSettings) => updateNotificationSettings(vendorId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId, 'notification-settings'] });
    },
  });

  // Matching Config
  const matchingConfigQuery = useQuery({
    queryKey: ['vendor', vendorId, 'matching-config'],
    queryFn: () => getMatchingConfig(vendorId!),
    enabled: !!vendorId,
  });

  const updateMatchingConfigMutation = useMutation({
    mutationFn: (data: MatchingConfig) => updateMatchingConfig(vendorId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId, 'matching-config'] });
    },
  });

  // Timezone
  const updateTimezoneMutation = useMutation({
    mutationFn: (data: TimezoneSettings) => updateTimezone(vendorId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId] });
    },
  });

  return {
    // Business Info
    businessInfo: businessInfoQuery.data,
    isLoadingBusinessInfo: businessInfoQuery.isLoading,
    updateBusinessInfo: updateBusinessInfoMutation.mutateAsync,
    isUpdatingBusinessInfo: updateBusinessInfoMutation.isPending,

    // AI Config
    aiConfig: aiConfigQuery.data,
    isLoadingAIConfig: aiConfigQuery.isLoading,
    updateAIConfig: updateAIConfigMutation.mutateAsync,
    isUpdatingAIConfig: updateAIConfigMutation.isPending,

    // Order Settings
    orderSettings: orderSettingsQuery.data,
    isLoadingOrderSettings: orderSettingsQuery.isLoading,
    updateOrderSettings: updateOrderSettingsMutation.mutateAsync,
    isUpdatingOrderSettings: updateOrderSettingsMutation.isPending,

    // Notification Settings
    notificationSettings: notificationSettingsQuery.data?.notificationSettings,
    isLoadingNotificationSettings: notificationSettingsQuery.isLoading,
    updateNotificationSettings: updateNotificationSettingsMutation.mutateAsync,
    isUpdatingNotificationSettings: updateNotificationSettingsMutation.isPending,

    // Matching Config
    matchingConfig: matchingConfigQuery.data?.matchingConfig,
    isLoadingMatchingConfig: matchingConfigQuery.isLoading,
    updateMatchingConfig: updateMatchingConfigMutation.mutateAsync,
    isUpdatingMatchingConfig: updateMatchingConfigMutation.isPending,

    // Timezone
    updateTimezone: updateTimezoneMutation.mutateAsync,
    isUpdatingTimezone: updateTimezoneMutation.isPending,
  };
}

