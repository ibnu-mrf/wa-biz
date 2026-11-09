import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Simulasi in-memory State Machine antrean webhook
interface InboundMessageJob {
  id: string;
  orgId: string;
  senderPhone: string;
  body: string;
  status: 'pending' | 'processing' | 'completed' | 'needs_reconciliation';
  leaseToken: string | null;
  lockedAt: number | null;
}

class MockWebhookQueueEngine {
  private jobs: Map<string, InboundMessageJob> = new Map();
  private leaseTimeoutMs = 5000;

  public receiveWebhook(msgId: string, orgId: string, phone: string, body: string): { status: string; job: InboundMessageJob } {
    const existing = this.jobs.get(msgId);
    if (existing) {
      if (existing.status === 'completed') {
        return { status: 'duplicate_already_completed', job: existing };
      }
      return { status: 'duplicate_in_progress', job: existing };
    }

    const job: InboundMessageJob = {
      id: msgId,
      orgId,
      senderPhone: phone,
      body,
      status: 'pending',
      leaseToken: null,
      lockedAt: null,
    };
    this.jobs.set(msgId, job);
    return { status: 'enqueued', job };
  }

  public claimJob(msgId: string, orgId: string, workerId: string): { claimed: boolean; leaseToken?: string; reason?: string } {
    const job = this.jobs.get(msgId);
    if (!job || job.orgId !== orgId) {
      return { claimed: false, reason: 'not_found_or_forbidden' };
    }

    const now = Date.now();
    if (job.status === 'processing') {
      const isStale = job.lockedAt && (now - job.lockedAt > this.leaseTimeoutMs);
      if (!isStale) {
        return { claimed: false, reason: 'in_progress_locked' };
      }
    } else if (job.status === 'completed') {
      return { claimed: false, reason: 'already_completed' };
    }

    const token = `lease_${workerId}_${now}`;
    job.status = 'processing';
    job.leaseToken = token;
    job.lockedAt = now;
    return { claimed: true, leaseToken: token };
  }

  public completeJob(msgId: string, leaseToken: string): boolean {
    const job = this.jobs.get(msgId);
    if (!job || job.leaseToken !== leaseToken) {
      return false; // Fencing token invalid
    }
    job.status = 'completed';
    job.lockedAt = null;
    return true;
  }

  public getJob(msgId: string): InboundMessageJob | undefined {
    return this.jobs.get(msgId);
  }
}

describe('Integration: In-Memory Webhook Queue, Lease Fencing & Anti-Duplication', () => {
  it('Alur Sempurna: Pesan masuk diterima, diklaim oleh worker, dan diselesaikan', () => {
    const engine = new MockWebhookQueueEngine();
    const receive = engine.receiveWebhook('msg_001', 'org_1', '628123456789', 'Tanya biaya pendaftaran');

    assert.equal(receive.status, 'enqueued');
    assert.equal(receive.job.status, 'pending');

    const claim = engine.claimJob('msg_001', 'org_1', 'worker_alpha');
    assert.equal(claim.claimed, true);
    assert.ok(claim.leaseToken?.startsWith('lease_worker_alpha'));

    const completed = engine.completeJob('msg_001', claim.leaseToken!);
    assert.equal(completed, true);

    const finalState = engine.getJob('msg_001');
    assert.equal(finalState?.status, 'completed');
  });

  it('Anti-Duplikasi: Webhook duplikat kedua ditolak saat webhook pertama selesai', () => {
    const engine = new MockWebhookQueueEngine();
    engine.receiveWebhook('msg_dup_001', 'org_1', '628123456789', 'Halo');
    const claim = engine.claimJob('msg_dup_001', 'org_1', 'w1');
    engine.completeJob('msg_dup_001', claim.leaseToken!);

    // Webhook duplikat kedua tiba
    const dupReceive = engine.receiveWebhook('msg_dup_001', 'org_1', '628123456789', 'Halo');
    assert.equal(dupReceive.status, 'duplicate_already_completed');
  });

  it('Lease Fencing: Worker dengan token usang ditolak menyelesaikan pekerjaan', () => {
    const engine = new MockWebhookQueueEngine();
    engine.receiveWebhook('msg_fence_001', 'org_1', '628123456789', 'Uji Fencing');
    const claim1 = engine.claimJob('msg_fence_001', 'org_1', 'w1');

    // Worker mencoba menyelesaikan dengan token palsu / usang
    const fraudComplete = engine.completeJob('msg_fence_001', 'lease_fake_token');
    assert.equal(fraudComplete, false);

    // Worker yang sah menyelesaikan
    const legitComplete = engine.completeJob('msg_fence_001', claim1.leaseToken!);
    assert.equal(legitComplete, true);
  });

  it('Isolasi Multi-Tenant: Organisasi B tidak dapat mengklaim pesan Organisasi A', () => {
    const engine = new MockWebhookQueueEngine();
    engine.receiveWebhook('msg_tenant_001', 'org_A', '628123456789', 'Pesan Khusus A');

    const claimCrossTenant = engine.claimJob('msg_tenant_001', 'org_B', 'worker_B');
    assert.equal(claimCrossTenant.claimed, false);
    assert.equal(claimCrossTenant.reason, 'not_found_or_forbidden');
  });
});
