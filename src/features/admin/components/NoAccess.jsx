import { ShieldX } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';

/** Shown when the admin's role lacks this section's permission (the API refuses it anyway). */
export function NoAccess() {
  return (
    <Card>
      <EmptyState
        icon={ShieldX}
        headingLevel={2}
        title="Your admin role doesn't include this"
        description="Ask a Super Admin if you need access."
      />
    </Card>
  );
}
