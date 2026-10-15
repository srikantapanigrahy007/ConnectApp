import { MessagesSquare } from 'lucide-react';
import { EmptyState } from '../../../components/ui/EmptyState';
import { usePageTitle } from '../../../hooks/use-page-title';

/** Right-hand pane when no conversation is selected (tablet/desktop only). */
export function ChatsIndexPage() {
  usePageTitle('Chats');
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={MessagesSquare}
        headingLevel={2}
        title="Select a conversation"
        description="Choose a conversation from the list, or find someone new to talk to."
      />
    </div>
  );
}
