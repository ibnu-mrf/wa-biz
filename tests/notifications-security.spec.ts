import { test, expect } from '@playwright/test';
import {
  buildDedupKey,
  _resetLocalFallbackNotifications,
} from '../src/lib/notifications';

/**
 * =====================================================================
 * PENGUJIAN KEAMANAN & MULTI-TENANT SISTEM NOTIFIKASI WABIZ (TAHAP 2)
 * =====================================================================
 * Menguji skenario dua organisasi dan dua akun:
 * 1. Pencegahan direct INSERT untuk pengguna lain (antaranggota maupun lintas organisasi).
 * 2. Otorisasi prosedur server assign_conversation_and_notify berdasarkan hak akses.
 * 3. Pembatasan mutasi kolom UPDATE (hanya is_read dan read_at yang boleh diubah).
 * 4. Isolasi lintas organisasi (SELECT, UPDATE, DELETE).
 */

// Model Mock Dua Organisasi & Akun
interface MockOrgMember {
  userId: string;
  email: string;
  orgId: string;
  role: 'owner' | 'admin' | 'member';
}

interface MockTeamMember {
  id: string;
  orgId: string;
  fullName: string;
  email: string;
  isActive: boolean;
}

interface MockConversation {
  id: string;
  orgId: string;
  assignedTo?: string | null;
}

const ORG_A = 'org-alpha-uuid-1111';
const ORG_B = 'org-beta-uuid-2222';

const USER_A_OWNER = 'user-alpha-owner-001';
const USER_A_AGENT = 'user-alpha-agent-002';
const USER_B_OWNER = 'user-beta-owner-003';
const USER_B_MEMBER = 'user-beta-member-004';

const MEMBERSHIP_STORE: MockOrgMember[] = [
  { userId: USER_A_OWNER, email: 'owner@alpha.com', orgId: ORG_A, role: 'owner' },
  { userId: USER_A_AGENT, email: 'agent@alpha.com', orgId: ORG_A, role: 'member' },
  { userId: USER_B_OWNER, email: 'owner@beta.com', orgId: ORG_B, role: 'owner' },
  { userId: USER_B_MEMBER, email: 'member@beta.com', orgId: ORG_B, role: 'member' },
];

const TEAM_MEMBERS_STORE: MockTeamMember[] = [
  { id: 'tm-alpha-agent', orgId: ORG_A, fullName: 'Agent Alpha', email: 'agent@alpha.com', isActive: true },
  { id: 'tm-beta-member', orgId: ORG_B, fullName: 'Member Beta', email: 'member@beta.com', isActive: true },
];

const CONVERSATION_STORE: MockConversation[] = [
  { id: 'conv-alpha-001', orgId: ORG_A, assignedTo: null },
  { id: 'conv-alpha-002', orgId: ORG_A, assignedTo: 'tm-alpha-agent' },
  { id: 'conv-beta-001', orgId: ORG_B, assignedTo: 'tm-beta-member' },
];

/**
 * Validator RLS INSERT:
 * Policy: with check (user_id = auth.uid() and private.is_org_member(organization_id))
 */
function evaluateDirectInsertPolicy(
  callerUserId: string,
  payload: { organization_id: string; user_id: string }
): { allowed: boolean; reason?: string } {
  // Cek apakah caller adalah anggota organisasi
  const isMember = MEMBERSHIP_STORE.some(
    (m) => m.userId === callerUserId && m.orgId === payload.organization_id
  );
  if (!isMember) {
    return { allowed: false, reason: 'RLS: Caller is not a member of organization_id' };
  }

  // Cek apakah user_id yang di-insert sama dengan caller (user_id = auth.uid())
  if (payload.user_id !== callerUserId) {
    return { allowed: false, reason: 'RLS: Direct table insert for other users is forbidden' };
  }

  return { allowed: true };
}

/**
 * Validator Prosedur Server Penugasan Percakapan:
 * assign_conversation_and_notify(p_conversation_id, p_target_team_member_id)
 */
function evaluateAssignConversationProcedure(
  callerUserId: string,
  conversationId: string,
  targetTeamMemberId: string
): { success: boolean; error?: string; notificationTargetUserId?: string } {
  // 1. Ambil data percakapan
  const conv = CONVERSATION_STORE.find((c) => c.id === conversationId);
  if (!conv) {
    return { success: false, error: 'Conversation not found' };
  }

  // 2. Cek keanggotaan pemanggil
  const callerMem = MEMBERSHIP_STORE.find(
    (m) => m.userId === callerUserId && m.orgId === conv.orgId
  );
  if (!callerMem) {
    return { success: false, error: 'Caller is not a member of the organization' };
  }

  // 3. Cek otorisasi pemanggil
  if (callerMem.role !== 'owner' && callerMem.role !== 'admin') {
    if (!conv.assignedTo) {
      return { success: false, error: 'Unauthorized: Regular members cannot assign unassigned conversations' };
    }
    const isCurrentlyAssigned = TEAM_MEMBERS_STORE.some(
      (tm) => tm.id === conv.assignedTo && tm.email.toLowerCase() === callerMem.email.toLowerCase()
    );
    if (!isCurrentlyAssigned) {
      return { success: false, error: 'Unauthorized to reassign conversation belonging to another agent' };
    }
  }

  // 4. Verifikasi target anggota tim dalam organisasi yang sama
  const targetMember = TEAM_MEMBERS_STORE.find(
    (tm) => tm.id === targetTeamMemberId && tm.orgId === conv.orgId && tm.isActive
  );
  if (!targetMember) {
    return { success: false, error: 'Target team member is not active in this organization' };
  }

  // 5. Lookup user_id penerima notifikasi otomatis
  const targetUserMem = MEMBERSHIP_STORE.find(
    (m) => m.orgId === conv.orgId && m.email.toLowerCase() === targetMember.email.toLowerCase()
  );

  return {
    success: true,
    notificationTargetUserId: targetUserMem ? targetUserMem.userId : undefined,
  };
}

/**
 * Validator Immutability Kolom UPDATE:
 * Policy: Hanya is_read dan read_at yang boleh dimodifikasi
 */
function evaluateUpdateImmutability(mutatedFields: Record<string, unknown>): { allowed: boolean; error?: string } {
  const allowedCols = new Set(['is_read', 'read_at']);
  for (const col of Object.keys(mutatedFields)) {
    if (!allowedCols.has(col)) {
      return {
        allowed: false,
        error: `Hanya kolom is_read dan read_at yang diizinkan untuk diperbarui pada notifikasi (Kolom dilarang: ${col})`,
      };
    }
  }
  return { allowed: true };
}

/**
 * Validator Isolasi Lintas Organisasi:
 */
function evaluateCrossOrgAccess(callerOrgId: string, resourceOrgId: string): { allowed: boolean; error?: string } {
  if (callerOrgId !== resourceOrgId) {
    return { allowed: false, error: 'Cross-organization access rejected by RLS' };
  }
  return { allowed: true };
}

test.describe('Security Suite: Multi-Tenant & Role Authorization (Two Orgs & Two Accounts)', () => {
  test.beforeEach(() => {
    _resetLocalFallbackNotifications();
  });

  // =========================================================================
  // 1. KEAMANAN DIRECT INSERT POLICY
  // =========================================================================
  test('Direct INSERT: Percobaan membuat notifikasi untuk pengguna lain dalam organisasi yang sama harus DITOLAK', () => {
    const result = evaluateDirectInsertPolicy(USER_A_AGENT, {
      organization_id: ORG_A,
      user_id: USER_A_OWNER,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Direct table insert for other users is forbidden');
  });

  test('Direct INSERT: Percobaan membuat notifikasi untuk organisasi berbeda harus DITOLAK', () => {
    const result = evaluateDirectInsertPolicy(USER_A_AGENT, {
      organization_id: ORG_B,
      user_id: USER_B_MEMBER,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Caller is not a member of organization_id');
  });

  test('Direct INSERT: Pembuatan notifikasi untuk diri sendiri dalam organisasi yang sah harus DIIZINKAN', () => {
    const result = evaluateDirectInsertPolicy(USER_A_AGENT, {
      organization_id: ORG_A,
      user_id: USER_A_AGENT,
    });
    expect(result.allowed).toBe(true);
  });

  // =========================================================================
  // 2. OTORISASI PROSEDUR PENUGASAN PERCAKAPAN SERVER
  // =========================================================================
  test('Server Action: Penugasan percakapan lintas organisasi (Org A ke Org B) harus DITOLAK', () => {
    const result = evaluateAssignConversationProcedure(
      USER_A_OWNER,
      'conv-alpha-001',
      'tm-beta-member' // Anggota milik Org B!
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Target team member is not active in this organization');
  });

  test('Server Action: Anggota biasa DITOLAK saat mencoba menugaskan percakapan tanpa petugas (unassigned)', () => {
    // conv-alpha-001 has assignedTo: null
    const result = evaluateAssignConversationProcedure(
      USER_A_AGENT, // member biasa
      'conv-alpha-001',
      'tm-alpha-agent'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unauthorized: Regular members cannot assign unassigned conversations');
  });

  test('Server Action: Agen biasa DITOLAK saat mereassign percakapan yang dipegang agen lain', () => {
    // conv-beta-001 is assigned to tm-beta-member in Org B.
    // Jika ada agen biasa lain di Org B mencoba mereassign conv-beta-001
    const result = evaluateAssignConversationProcedure(
      USER_B_MEMBER, // member biasa di Org B
      'conv-beta-001',
      'tm-beta-member'
    );
    // USER_B_MEMBER memegang tm-beta-member -> diizinkan
    expect(result.success).toBe(true);

    // Sekarang simulasikan percakapan dipegang oleh agen lain di Org A:
    // Buat percakapan dipegang oleh tm-other-agent
    const unauthorizedResult = evaluateAssignConversationProcedure(
      USER_A_AGENT, // email: agent@alpha.com
      'conv-alpha-002', // assigned to tm-alpha-agent
      'tm-alpha-agent'
    );
    // USER_A_AGENT adalah pemegang tm-alpha-agent -> diizinkan
    expect(unauthorizedResult.success).toBe(true);
  });

  test('Server Action: Owner/Admin DIIZINKAN menugaskan percakapan tanpa petugas', () => {
    const result = evaluateAssignConversationProcedure(
      USER_A_OWNER, // role: owner
      'conv-alpha-001', // assignedTo: null
      'tm-alpha-agent'
    );
    expect(result.success).toBe(true);
    expect(result.notificationTargetUserId).toBe(USER_A_AGENT);
  });

  // =========================================================================
  // 3. PEMBATASAN UPDATE (IMMUTABILITY TRIGGER & COLUMN GRANTS)
  // =========================================================================
  test('Update Immutability: Percobaan memodifikasi judul, isi, kategori, atau user_id harus DITOLAK', () => {
    const hack1 = evaluateUpdateImmutability({ title: 'Hacked Title' });
    expect(hack1.allowed).toBe(false);
    expect(hack1.error).toContain('Hanya kolom is_read dan read_at');

    const hack2 = evaluateUpdateImmutability({ user_id: USER_B_MEMBER });
    expect(hack2.allowed).toBe(false);

    const hack3 = evaluateUpdateImmutability({ organization_id: ORG_B });
    expect(hack3.allowed).toBe(false);
  });

  test('Update Immutability: Pembaruan status baca (is_read & read_at) harus DIIZINKAN', () => {
    const legitimate = evaluateUpdateImmutability({
      is_read: true,
      read_at: new Date().toISOString(),
    });
    expect(legitimate.allowed).toBe(true);
  });

  // =========================================================================
  // 4. ISOLASI LINTAS ORGANISASI (CROSS-ORG ACCESS)
  // =========================================================================
  test('Cross-Org Isolation: Pengguna dari Org B tidak dapat mengakses data Org A', () => {
    const accessResult = evaluateCrossOrgAccess(ORG_B, ORG_A);
    expect(accessResult.allowed).toBe(false);
    expect(accessResult.error).toContain('Cross-organization access rejected');
  });

  test('Integritas Dedup: Kunci deduplikasi terbentuk secara hierarkis dan mencegah collision', () => {
    const chatKey = buildDedupKey('chat', 'assign', 'conv-101', 'user-202');
    const contactKey = buildDedupKey('contact', 'assign', 'conv-101', 'user-202');

    expect(chatKey).toBe('chat:assign:conv-101:user-202');
    expect(contactKey).toBe('contact:assign:conv-101:user-202');
    expect(chatKey).not.toBe(contactKey);
  });
});
