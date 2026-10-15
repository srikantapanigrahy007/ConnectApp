import { Ban, Bell, MessageCircle, Plus, Search, Settings, Trash, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { PageContainer, PageHeader } from '../../components/layout/Page';
import { Alert, NotImplementedNotice } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, CountBadge, NotImplementedBadge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { DropdownMenu } from '../../components/ui/DropdownMenu';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Field } from '../../components/ui/Field';
import { Checkbox, Select, Switch, Textarea } from '../../components/ui/FormControls';
import { Input, PasswordInput } from '../../components/ui/Input';
import { ListSkeleton, Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../components/ui/toast-context';
import { buttonClasses } from '../../components/ui/button-styles';
import { ConversationListItem } from '../messaging/components/ConversationListItem';
import { MessageComposer } from '../messaging/components/MessageComposer';
import { MessageList } from '../messaging/components/MessageList';

import { NotificationItem } from '../notifications/components/NotificationItem';
import { GroupListItem } from '../groups/components/GroupListItem';
import { UserListItem } from '../users/components/UserListItem';

/*
 * DEVELOPMENT ONLY — registered only when import.meta.env.DEV, so it is never part of a
 * production build. Everything below is static sample content for visual review of components;
 * none of it comes from, or claims to represent, a real backend.
 */

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

const sampleConversations = [
  {
    id: 'sample-1',
    title: 'Ada Lovelace',
    presence: 'online',
    isGroup: false,
    unreadCount: 2,
    lastMessage: {
      preview: 'Shall we review the engine notes tomorrow?',
      sentAt: minutesAgo(4),
      fromSelf: false,
    },
  },
  {
    id: 'sample-2',
    title: 'Design team',
    isGroup: true,
    unreadCount: 0,
    lastMessage: { preview: 'Uploaded the new icons', sentAt: minutesAgo(60 * 26), fromSelf: true },
  },
];

const ada = { id: 'u-ada', name: 'Ada Lovelace' };
const me = { id: 'u-me', name: 'You' };
const sampleMessages = [
  {
    id: 'm1',
    author: ada,
    isOwn: false,
    sentAt: minutesAgo(60 * 25),
    body: 'Did you get a chance to read the notes?',
  },
  {
    id: 'm2',
    author: me,
    isOwn: true,
    sentAt: minutesAgo(60 * 24.9),
    body: 'Yes! Section G is brilliant.',
    status: 'read',
  },
  {
    id: 'm3',
    author: ada,
    isOwn: false,
    sentAt: minutesAgo(6),
    body: 'Shall we review the engine notes tomorrow?',
  },
  {
    id: 'm4',
    author: ada,
    isOwn: false,
    sentAt: minutesAgo(5),
    body: 'Morning works best for me.',
  },
  {
    id: 'm5',
    author: me,
    isOwn: true,
    sentAt: minutesAgo(2),
    body: 'Morning is perfect.\nSee you at 10.',
    status: 'delivered',
  },
  {
    id: 'm6',
    author: me,
    isOwn: true,
    sentAt: minutesAgo(1),
    body: 'This one failed to send',
    status: 'failed',
  },
];

const sampleNotifications = [
  {
    id: 'n1',
    kind: 'message_request',
    text: 'Grace Hopper sent you a message request',
    createdAt: minutesAgo(12),
    read: false,
  },
  {
    id: 'n2',
    kind: 'group_invite',
    text: 'You were added to Design team',
    createdAt: minutesAgo(60 * 30),
    read: true,
  },
];

function Section({ title, children }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  );
}

function Row({ children }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export function UiKitPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);

  return (
    <PageContainer width="lg">
      <PageHeader
        title="UI kit"
        description="Every reusable component and state in one place, for visual and keyboard review."
      />
      <Alert tone="warning" title="Development only — sample content" className="mb-6">
        This page is excluded from production builds. Names and messages below are static examples
        for reviewing components, not real data.
      </Alert>

      <div className="space-y-6">
        <Section title="Buttons">
          <Row>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger" icon={Trash}>
              Danger
            </Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
          </Row>
          <Row>
            <Button size="sm" icon={Plus}>
              Small
            </Button>
            <Button size="lg">Large</Button>
            <IconButton label="Settings" icon={Settings} />
            <IconButton label="Add person" icon={UserPlus} variant="secondary" />
            <IconButton label="New message" icon={MessageCircle} variant="primary" />
          </Row>
        </Section>

        <Section title="Inputs">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Text" hint="Helper text describes the field.">
              {(control) => <Input {...control} placeholder="Placeholder" />}
            </Field>
            <Field label="With error" error="This field has an error">
              {(control) => <Input {...control} defaultValue="Invalid value" />}
            </Field>
            <Field label="Search">
              {(control) => <Input {...control} leadingIcon={Search} type="search" />}
            </Field>
            <Field label="Password">
              {(control) => <PasswordInput {...control} defaultValue="secret" />}
            </Field>
            <Field label="Select">
              {(control) => (
                <Select {...control}>
                  <option>Everyone</option>
                  <option>Nobody</option>
                </Select>
              )}
            </Field>
            <Field label="Disabled">
              {(control) => <Input {...control} disabled placeholder="Not editable" />}
            </Field>
          </div>
          <Field label="Textarea" optional>
            {(control) => <Textarea {...control} />}
          </Field>
          <Row>
            <Checkbox label="Checkbox" description="With a description." />
            <span className="flex items-center gap-2 text-sm text-ink">
              <Switch checked={switchOn} onCheckedChange={setSwitchOn} label="Example switch" />
              Switch is {switchOn ? 'on' : 'off'}
            </span>
          </Row>
        </Section>

        <Section title="Badges and avatars">
          <Row>
            <Badge>Neutral</Badge>
            <Badge tone="primary">Primary</Badge>
            <Badge tone="success" dot>
              Online
            </Badge>
            <Badge tone="warning" dot>
              Connecting
            </Badge>
            <Badge tone="danger" dot>
              Disconnected
            </Badge>
            <NotImplementedBadge />
            <CountBadge count={3} label="3 unread" />
            <CountBadge count={140} label="140 unread" />
          </Row>
          <Row>
            <Avatar name="Ada Lovelace" size="xs" />
            <Avatar name="Ada Lovelace" size="sm" />
            <Avatar name="Ada Lovelace" presence="online" />
            <Avatar name="Grace Hopper" size="lg" presence="offline" />
            <Avatar size="xl" />
          </Row>
        </Section>

        <Section title="Dropdown, dialog and toasts">
          <Row>
            <DropdownMenu
              label="Example menu"
              align="start"
              triggerClassName={buttonClasses({ variant: 'secondary' })}
              trigger="Open menu"
              items={[
                { type: 'label', label: 'Example actions' },
                {
                  label: 'Notifications',
                  icon: Bell,
                  onSelect: () => toast({ title: 'Menu item selected' }),
                },
                { label: 'Disabled item', disabled: true, hint: 'Not available yet' },
                { type: 'separator' },
                {
                  label: 'Block',
                  icon: Ban,
                  tone: 'danger',
                  onSelect: () => toast({ title: 'Danger item selected' }),
                },
              ]}
            />
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>
              Open dialog
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast({ title: 'Info toast', description: 'Auto-dismisses after 6 seconds.' })
              }
            >
              Info toast
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast({ tone: 'success', title: 'Success toast' })}
            >
              Success toast
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast({
                  tone: 'danger',
                  title: 'Error toast',
                  description: 'Stays until dismissed.',
                })
              }
            >
              Error toast
            </Button>
          </Row>
          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title="Example dialog"
            description="Focus is trapped inside; Escape or the backdrop closes it."
            footer={
              <>
                <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
              </>
            }
          >
            <Field label="Example field">{(control) => <Input {...control} />}</Field>
          </Dialog>
        </Section>

        <Section title="Tabs">
          <Tabs
            label="Example tabs"
            tabs={[
              {
                id: 'one',
                label: 'First',
                count: 2,
                content: <p className="text-sm text-ink-muted">First panel.</p>,
              },
              {
                id: 'two',
                label: 'Second',
                content: <p className="text-sm text-ink-muted">Second panel.</p>,
              },
            ]}
          />
        </Section>

        <Section title="Loading, empty and error states">
          <Row>
            <Spinner className="text-primary-600" />
            <Skeleton className="h-4 w-40" />
          </Row>
          <Card>
            <ListSkeleton rows={2} />
          </Card>
          <Card>
            <EmptyState
              icon={MessageCircle}
              title="Empty state"
              description="Explains what will appear here and what to do next."
              action={<Button size="sm">Call to action</Button>}
            />
          </Card>
          <ErrorState
            message="A short, human explanation of what went wrong."
            onRetry={() => toast({ title: 'Retry clicked' })}
          />
          <Alert tone="success" title="Success alert">
            Only shown after an action really succeeded.
          </Alert>
          <Alert tone="danger" title="Error alert">
            Something needs attention.
          </Alert>
          <NotImplementedNotice>
            Used on every screen whose feature isn't built yet.
          </NotImplementedNotice>
        </Section>

        <Section title="Messaging components (sample content)">
          <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <Card className="p-2">
              {sampleConversations.map((conversation) => (
                <ConversationListItem key={conversation.id} conversation={conversation} />
              ))}
            </Card>
            <Card className="overflow-hidden">
              <div className="bg-canvas p-4">
                <MessageList messages={sampleMessages} label="Sample messages" />
              </div>
              <MessageComposer
                onSend={(body) => toast({ title: 'Composer submitted', description: body })}
              />
            </Card>
          </div>
        </Section>

        <Section title="People, groups and notifications (sample content)">
          <Card className="divide-y divide-border">
            <UserListItem
              user={{
                id: 'u1',
                displayName: 'Grace Hopper',
                username: 'grace_hopper',
                presence: 'online',
              }}
              meta="Sent you a message request"
              actions={
                <>
                  <Button size="sm" className="flex-1 sm:flex-none">
                    Accept
                  </Button>
                  <Button size="sm" variant="secondary" className="flex-1 sm:flex-none">
                    Ignore
                  </Button>
                </>
              }
            />
            <GroupListItem
              group={{ id: 'g1', name: 'Design team', memberCount: 6, description: 'Icons and UI' }}
            />
          </Card>
          <Card className="divide-y divide-border overflow-hidden">
            {sampleNotifications.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} />
            ))}
          </Card>
        </Section>
      </div>
    </PageContainer>
  );
}
