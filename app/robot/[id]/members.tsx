/**
 * S14 Sharing & Members Screen
 * Manage members (Owner & Controllers), create invites with expiration (24h, 7d, never),
 * copy/share invite codes, revoke invites, or remove controllers.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Modal,
  RefreshControl,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  UserPlus,
  Crown,
  User,
  Trash2,
  Share2,
  Info,
  X,
} from 'lucide-react-native';
import { useTheme } from '../../../src/theme';
import { typography, spacing, radius } from '../../../src/theme/tokens';
import { robotService } from '../../../src/services';
import { Button } from '../../../src/components/Button';
import type { RobotMember, Invite } from '../../../src/types';

export default function MembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const colors = theme.colors;
  const { t } = useTranslation();

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteExpiry, setInviteExpiry] = useState<'24h' | '7d' | 'never'>('24h');
  const [createdInvite, setCreatedInvite] = useState<Invite | null>(null);

  const {
    data: members = [],
    refetch: refetchMembers,
    isRefetching,
  } = useQuery({
    queryKey: ['members', id],
    queryFn: () => robotService.getMembers(id as string),
    enabled: Boolean(id),
  });

  const {
    data: invites = [],
    refetch: refetchInvites,
  } = useQuery({
    queryKey: ['invites', id],
    queryFn: () => robotService.listInvites(id as string),
    enabled: Boolean(id),
  });

  const handleCreateInvite = async () => {
    try {
      const inv = await robotService.createInvite(id as string, inviteExpiry);
      setCreatedInvite(inv);
      queryClient.invalidateQueries({ queryKey: ['invites', id] });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create invite');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    Alert.alert(
      t('share.revoke', 'Revoke'),
      'Are you sure you want to revoke this invite code?',
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('share.revoke', 'Revoke'),
          style: 'destructive',
          onPress: async () => {
            await robotService.revokeInvite(inviteId);
            queryClient.invalidateQueries({ queryKey: ['invites', id] });
          },
        },
      ],
    );
  };

  const handleRemoveMember = async (member: RobotMember) => {
    Alert.alert(
      t('share.removeAccess', 'Remove access'),
      `Remove ${member.fullName}'s access to this LUMI?`,
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Remove'),
          style: 'destructive',
          onPress: async () => {
            await robotService.removeMember(id as string, member.userId);
            queryClient.invalidateQueries({ queryKey: ['members', id] });
          },
        },
      ],
    );
  };

  const handleShareCode = async (code: string) => {
    try {
      await Share.share({
        message: `Join my LUMI robot companion! Use invite code: ${code}`,
      });
    } catch {
      // Ignored
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View
        style={[
          styles.topBar,
          {
            borderBottomColor: colors.border,
            paddingTop: insets.top,
            height: 56 + insets.top,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('share.title', 'Share LUMI')}
        </Text>

        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + spacing.xxl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetchMembers();
              refetchInvites();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Info card */}
        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
          ]}
        >
          <Info size={18} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t(
              'share.controllersInfo',
              'Controllers can see, hear, talk and drive LUMI, but cannot change settings or invite others.',
            )}
          </Text>
        </View>

        {/* Invite someone button */}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => {
            setCreatedInvite(null);
            setShowInviteModal(true);
          }}
        >
          <UserPlus size={18} color={colors.primaryText} style={{ marginRight: 8 }} />
          {t('share.inviteSomeone', 'Invite someone')}
        </Button>

        {/* Pending Invites */}
        {invites.filter((i) => !i.revoked).length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              {t('share.pendingInvites', 'PENDING INVITES')}
            </Text>

            <View
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              {invites
                .filter((i) => !i.revoked)
                .map((inv, idx) => (
                  <View key={inv.id}>
                    <View style={styles.inviteRow}>
                      <View style={styles.inviteLeft}>
                        <Text
                          style={[styles.inviteCode, { color: colors.primary }]}
                        >
                          {inv.code}
                        </Text>
                        <Text
                          style={[
                            styles.inviteMeta,
                            { color: colors.textTertiary },
                          ]}
                        >
                          Expires: {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : 'Never'}
                        </Text>
                      </View>

                      <View style={styles.inviteActions}>
                        <Pressable
                          onPress={() => handleShareCode(inv.code)}
                          hitSlop={8}
                          style={styles.actionBtn}
                        >
                          <Share2 size={18} color={colors.textSecondary} />
                        </Pressable>
                        <Pressable
                          onPress={() => handleRevokeInvite(inv.id)}
                          hitSlop={8}
                          style={styles.actionBtn}
                        >
                          <Trash2 size={18} color={colors.error} />
                        </Pressable>
                      </View>
                    </View>
                    {idx < invites.length - 1 && (
                      <View
                        style={[styles.divider, { backgroundColor: colors.border }]}
                      />
                    )}
                  </View>
                ))}
            </View>
          </View>
        )}

        {/* Members List */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
            MEMBERS ({members.length})
          </Text>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {members.map((member, idx) => {
              const isOwner = member.role === 'owner';
              return (
                <View key={member.userId}>
                  <View style={styles.memberRow}>
                    <View
                      style={[
                        styles.avatarCircle,
                        {
                          backgroundColor: isOwner
                            ? colors.accent + '25'
                            : colors.surfaceAlt,
                        },
                      ]}
                    >
                      {isOwner ? (
                        <Crown size={20} color={colors.accent} />
                      ) : (
                        <User size={20} color={colors.textSecondary} />
                      )}
                    </View>

                    <View style={styles.memberInfo}>
                      <View style={styles.memberNameRow}>
                        <Text
                          style={[styles.memberName, { color: colors.textPrimary }]}
                        >
                          {member.fullName}
                        </Text>
                        {isOwner && (
                          <View
                            style={[
                              styles.ownerTag,
                              { backgroundColor: colors.accent + '20' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.ownerTagText,
                                { color: colors.accent },
                              ]}
                            >
                              OWNER
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[styles.memberEmail, { color: colors.textSecondary }]}
                      >
                        {member.email}
                      </Text>
                    </View>

                    {!isOwner && (
                      <Pressable
                        onPress={() => handleRemoveMember(member)}
                        hitSlop={8}
                        style={styles.actionBtn}
                      >
                        <Trash2 size={18} color={colors.error} />
                      </Pressable>
                    )}
                  </View>

                  {idx < members.length - 1 && (
                    <View
                      style={[styles.divider, { backgroundColor: colors.border }]}
                    />
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* ── Create Invite Modal ── */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowInviteModal(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {t('share.inviteSomeone', 'Invite someone')}
              </Text>
              <Pressable
                onPress={() => setShowInviteModal(false)}
                hitSlop={8}
                style={styles.actionBtn}
              >
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {!createdInvite ? (
              <View style={styles.modalBody}>
                <Text
                  style={[styles.fieldLabel, { color: colors.textSecondary }]}
                >
                  {t('share.inviteDuration', 'How long should this invite work?')}
                </Text>

                <View style={styles.expiryOptionsRow}>
                  {[
                    { key: '24h', label: t('share.hours24', '24 hours') },
                    { key: '7d', label: t('share.days7', '7 days') },
                    { key: 'never', label: t('share.noExpiry', 'No expiry') },
                  ].map(({ key, label }) => {
                    const isSelected = inviteExpiry === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setInviteExpiry(key as any)}
                        style={[
                          styles.expiryBtn,
                          {
                            backgroundColor: isSelected
                              ? colors.primary + '20'
                              : colors.surfaceAlt,
                            borderColor: isSelected
                              ? colors.primary
                              : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.expiryBtnText,
                            {
                              color: isSelected
                                ? colors.primary
                                : colors.textPrimary,
                              fontWeight: isSelected ? '700' : '500',
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onPress={handleCreateInvite}
                  style={{ marginTop: spacing.md }}
                >
                  {t('share.createInvite', 'Create invite')}
                </Button>
              </View>
            ) : (
              <View style={styles.createdInviteView}>
                <Text
                  style={[styles.codeDisplayLabel, { color: colors.textSecondary }]}
                >
                  {t('share.inviteCode', 'Invite code')}
                </Text>
                <View
                  style={[
                    styles.codeBox,
                    { backgroundColor: colors.surfaceAlt, borderColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.codeLarge, { color: colors.primary }]}>
                    {createdInvite.code}
                  </Text>
                </View>

                <View style={styles.inviteModalActions}>
                  <Button
                    variant="primary"
                    size="md"
                    fullWidth
                    onPress={() => handleShareCode(createdInvite.code)}
                  >
                    <Share2 size={18} color={colors.primaryText} style={{ marginRight: 6 }} />
                    {t('share.shareLink', 'Share link')}
                  </Button>

                  <Button
                    variant="secondary"
                    size="md"
                    fullWidth
                    onPress={() => setShowInviteModal(false)}
                  >
                    {t('common.done', 'Done')}
                  </Button>
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  iconBtn: {
    padding: spacing.xs,
  },
  title: {
    ...typography.h3,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  infoText: {
    ...typography.caption,
    flex: 1,
    lineHeight: 18,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.overline,
    marginLeft: spacing.xs,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  inviteLeft: {
    gap: 2,
  },
  inviteCode: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  inviteMeta: {
    ...typography.caption,
  },
  inviteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionBtn: {
    padding: spacing.xs,
  },
  divider: {
    height: 1,
    marginLeft: spacing.md,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  memberName: {
    ...typography.bodyBold,
  },
  ownerTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  ownerTagText: {
    fontSize: 9,
    fontWeight: '800',
  },
  memberEmail: {
    ...typography.caption,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    ...typography.h3,
  },
  modalBody: {
    gap: spacing.md,
  },
  fieldLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  expiryOptionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  expiryBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  expiryBtnText: {
    fontSize: 12,
  },
  createdInviteView: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  codeDisplayLabel: {
    ...typography.caption,
  },
  codeBox: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  codeLarge: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
  },
  inviteModalActions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
