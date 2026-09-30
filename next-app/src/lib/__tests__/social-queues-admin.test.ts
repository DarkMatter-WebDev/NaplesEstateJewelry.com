import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin social queues entry point', () => {
  it('keeps a first-class Social Queues tab linked to the dashboard route', () => {
    const header = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'AdminHeader.tsx'), 'utf8');
    const page = readFileSync(join(process.cwd(), 'src', 'app', '[locale]', 'admin', 'social-queues', 'page.tsx'), 'utf8');

    expect(header).toContain("'social-queues': 'Social Queues'");
    expect(header).toContain('`${adminBasePath}/social-queues`');
    expect(page).toContain('SocialQueuesDashboard');
    expect(page).toContain("active=\"social-queues\"");
  });

  it('lets the scheduled workers consume only due pending or reviewed posts', () => {
    for (const channel of ['instagram', 'facebook']) {
      const sync = readFileSync(join(process.cwd(), 'src', 'lib', channel, 'sync.ts'), 'utf8');
      expect(sync).toContain(".in('sync_state', ['pending', 'review'])");
      expect(sync).toContain(".not('scheduled_for', 'is', null)");
      expect(sync).toContain(".lte('scheduled_for'");
    }
  });

  it('requires a selected time at every queue API and exposes dashboard publish, reschedule, and remove controls', () => {
    const instagramRoute = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'admin', 'instagram', 'sync', 'route.ts'), 'utf8');
    const facebookRoute = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'admin', 'facebook', 'sync', 'route.ts'), 'utf8');
    const actions = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'SocialQueueRowActions.tsx'), 'utf8');
    const modal = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'SocialScheduleModal.tsx'), 'utf8');

    expect(instagramRoute).toContain('validateSocialScheduledFor');
    expect(facebookRoute).toContain('validateSocialScheduledFor');
    expect(actions).toContain('Post now');
    expect(actions).toContain('useSocialBackgroundPublish');
    expect(actions).toContain('Yes, post in background');
    expect(actions).toContain('Change time');
    expect(actions).toContain('Remove');
    expect(actions).toContain("request('unqueue')");
    expect(modal).toContain('type="date"');
    expect(modal).toContain('<select');
    expect(modal).toContain('noon, 2 PM, 4 PM, 6 PM, 8 PM, 10 PM, or midnight');
    expect(actions).toContain('social-queue-row-actions');
    expect(actions).toContain('social-queue-row-action');
  });

  it('mounts one route-persistent background publishing widget with progress and completion states', () => {
    const layout = readFileSync(join(process.cwd(), 'src', 'app', '[locale]', 'layout.tsx'), 'utf8');
    const provider = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'SocialBackgroundPublishProvider.tsx'), 'utf8');

    expect(layout).toContain('<SocialBackgroundPublishProvider>');
    expect(provider).toContain('Uploading to ${label}');
    expect(provider).toContain('Working in the background');
    expect(provider).toContain('Upload complete');
    expect(provider).toContain('Try again');
    expect(provider).toContain('router.refresh()');
  });

  it('supports channel-specific row selection and sequential background bulk publishing', () => {
    const dashboard = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'SocialQueuesDashboard.tsx'), 'utf8');
    const provider = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'SocialBackgroundPublishProvider.tsx'), 'utf8');
    const publisher = readFileSync(join(process.cwd(), 'src', 'lib', 'social-background-publish.ts'), 'utf8');

    expect(dashboard).toContain('Select all ready {label} posts');
    expect(dashboard).toContain('Post selected now');
    expect(dashboard).toContain('startPublishBatch');
    expect(dashboard).toContain('Yes, post all in background');
    expect(dashboard).toContain('selectedIds');
    expect(provider).toContain('startPublishBatch');
    expect(provider).toContain('runSocialPublishBatchInBackground');
    expect(publisher).toContain('for (let index = 0; index < items.length; index += 1)');
    expect(publisher).toContain('await runSocialPublishInBackground(channel, item.productId');
    expect(provider).toContain('launchBatch(items, completedCount)');
    expect(provider).toContain('Retry resumes with this post');
  });

  it('loads the latest published receipts and exposes the supported post actions in one modal', () => {
    const page = readFileSync(join(process.cwd(), 'src', 'app', '[locale]', 'admin', 'social-queues', 'page.tsx'), 'utf8');
    const dashboard = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'SocialQueuesDashboard.tsx'), 'utf8');
    const modal = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'SocialLatestPostsModal.tsx'), 'utf8');

    expect(page).toContain("const LATEST_POST_COLUMNS = 'product_id, posted_at, permalink'");
    expect(page).toContain(".eq('sync_state', 'published')");
    expect(page).toContain('.limit(12)');
    expect(page).toContain('latestPosts: instagramLatestRows');
    expect(page).toContain('latestPosts: facebookLatestRows');
    expect(dashboard).toContain('Latest Posts');
    expect(dashboard).toContain('<SocialLatestPostsModal');
    expect(modal).toContain('View post');
    expect(modal).toContain('Comment');
    expect(modal).toContain('Refresh status');
    expect(modal).toContain('Open to remove');
    expect(modal).toContain('Yes, remove Facebook post');
    expect(modal).toContain('collapsedChannels');
    expect(modal).toContain('aria-expanded={!collapsed}');
    expect(modal).toContain('hidden={collapsed}');
    expect(modal).toContain("request(channel, 'comment'");
    expect(modal).toContain("request('facebook', 'delete'");
  });

  it('keeps owner-written comments admin-only, length-bounded, and channel-specific', () => {
    for (const channel of ['instagram', 'facebook']) {
      const route = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'admin', channel, 'comment', 'route.ts'), 'utf8');
      const sync = readFileSync(join(process.cwd(), 'src', 'lib', channel, 'sync.ts'), 'utf8');

      expect(route).toContain('requireAdmin()');
      expect(route).toContain('comment.length > 1_000');
      expect(route).toContain('addPostComment');
      expect(sync).toContain('export async function addPostComment');
      expect(sync).toContain("action: 'comment'");
      expect(sync).toContain("sync_state !== 'published'");
    }
  });

  it('carries a safe Social Queues return target into the shared manager header', () => {
    const dashboard = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'SocialQueuesDashboard.tsx'), 'utf8');
    const manager = readFileSync(join(process.cwd(), 'src', 'components', 'admin', 'ProductMarketplaceManagerPage.tsx'), 'utf8');
    const renderer = readFileSync(join(process.cwd(), 'src', 'app', '[locale]', 'admin', 'products', '[id]', 'marketplace-page.tsx'), 'utf8');

    expect(dashboard).toContain('?returnTo=social-queues');
    expect(manager).toContain("returnTo === 'social-queues'");
    expect(manager).toContain("'Back to Social Queues'");
    expect(manager).toContain('`${adminBasePath}/social-queues`');
    expect(renderer).toContain("returnTo === 'social-queues'");
    expect(renderer).toContain("active={returnToSocialQueues ? 'social-queues' : 'products'}");
  });
});
