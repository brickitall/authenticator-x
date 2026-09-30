import { useState } from 'react';
import { liveGroups, liveItems, type VaultData } from '@authx/core';
import type { Mutate } from '../lib/messaging.js';
import { PlusIcon, TrashIcon } from '../ui/icons.js';
import { Button, Callout, Field, cx } from '../ui/primitives.js';
import { Section } from './Section.js';

/**
 * Creating, ordering and removing groups.
 *
 * Assigning an account to one happens where the account is edited, not here —
 * the two lists would otherwise have to be kept in sync by eye.
 */
export function GroupsPanel({ data, mutate }: { data: VaultData; mutate: Mutate }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const groups = liveGroups(data);
  const items = liveItems(data);
  const countIn = (id: string) => items.filter((item) => item.groupId === id).length;
  const ungrouped = items.filter((item) => !item.groupId).length;

  return (
    <Section
      title="Groups"
      description="Headings in the list, so a long vault can be read at a glance. Accounts are put into one from the account's own Edit screen."
    >
      <div className="flex flex-col gap-4 p-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            void mutate({ op: 'groups/add', name });
            setName('');
          }}
        >
          <div className="flex-1">
            <Field
              label="New group"
              placeholder="Work"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" disabled={name.trim().length === 0}>
            <PlusIcon /> Add
          </Button>
        </form>

        {groups.length === 0 ? (
          <Callout>
            No groups yet. Everything shows in one list, which is the right answer until there is
            enough in it to need dividing.
          </Callout>
        ) : (
          <ul className="rounded-xl border border-zinc-200 dark:border-zinc-800">
            {groups.map((group, index) => (
              <li
                key={group.id}
                className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2.5 last:border-b-0 dark:border-zinc-900"
              >
                <div className="flex shrink-0 flex-col">
                  {([-1, 1] as const).map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      aria-label={direction === -1 ? `Move ${group.name} up` : `Move ${group.name} down`}
                      disabled={direction === -1 ? index === 0 : index === groups.length - 1}
                      onClick={() => void mutate({ op: 'groups/move', id: group.id, direction })}
                      className={cx(
                        'px-1 text-[9px] leading-none text-zinc-400 hover:text-zinc-700 disabled:opacity-25',
                        'dark:hover:text-zinc-200',
                      )}
                    >
                      {direction === -1 ? '▲' : '▼'}
                    </button>
                  ))}
                </div>

                {editing?.id === group.id ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void mutate({ op: 'groups/rename', id: group.id, name: editing.name });
                      setEditing(null);
                    }}
                  >
                    <input
                      autoFocus
                      value={editing.name}
                      onChange={(event) => setEditing({ id: group.id, name: event.target.value })}
                      className="h-8 flex-1 rounded-lg border border-zinc-200 px-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <Button size="sm" type="submit" variant="primary">
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{group.name}</p>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                        {countIn(group.id)} {countIn(group.id) === 1 ? 'account' : 'accounts'}
                      </p>
                    </div>

                    {confirmingDelete === group.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                          Accounts stay, ungrouped.
                        </span>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            await mutate({ op: 'groups/delete', id: group.id });
                            setConfirmingDelete(null);
                          }}
                        >
                          Remove
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => setEditing({ id: group.id, name: group.name })}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${group.name}`}
                          onClick={() => setConfirmingDelete(group.id)}
                        >
                          <TrashIcon />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {groups.length > 0 && ungrouped > 0 && (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            {ungrouped} {ungrouped === 1 ? 'account is' : 'accounts are'} in no group, and appear
            under “Ungrouped” at the end of the list.
          </p>
        )}
      </div>
    </Section>
  );
}
