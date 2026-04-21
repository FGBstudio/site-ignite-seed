import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2, Building2, Truck, Copy, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useContacts, useDeleteContact } from "@/hooks/useContacts";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import type { Contact, ContactKind } from "@/types/contacts";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Contacts() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<ContactKind>("client");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: contacts = [], isLoading } = useContacts(tab);
  const del = useDeleteContact();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.company_name, c.vat_number, c.city, c.country, c.email, c.primary_contact_name]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    );
  }, [contacts, search]);

  const onNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const onEdit = (c: Contact) => {
    setEditing(c);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await del.mutateAsync(deletingId);
      toast({ title: "Contact deleted" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Delete failed", description: e.message });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <MainLayout title="Contacts" subtitle="Client & supplier directory">
      <div className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as ContactKind)}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <TabsList>
              <TabsTrigger value="client" className="gap-2">
                <Building2 className="h-3.5 w-3.5" /> Clients
              </TabsTrigger>
              <TabsTrigger value="supplier" className="gap-2">
                <Truck className="h-3.5 w-3.5" /> Suppliers
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2 flex-1 sm:flex-none sm:min-w-[420px]">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by company, VAT, city, email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {isAdmin && (
                <Button onClick={onNew} className="gap-1.5">
                  <Plus className="h-4 w-4" /> New {tab === "client" ? "client" : "supplier"}
                </Button>
              )}
            </div>
          </div>

          <TabsContent value="client" className="mt-4">
            <ContactList
              contacts={filtered}
              loading={isLoading}
              isAdmin={isAdmin}
              onEdit={onEdit}
              onDelete={(id) => setDeletingId(id)}
              onCopy={(text, label) => {
                navigator.clipboard.writeText(text);
                toast({ title: `${label} copied` });
              }}
            />
          </TabsContent>
          <TabsContent value="supplier" className="mt-4">
            <ContactList
              contacts={filtered}
              loading={isLoading}
              isAdmin={isAdmin}
              onEdit={onEdit}
              onDelete={(id) => setDeletingId(id)}
              onCopy={(text, label) => {
                navigator.clipboard.writeText(text);
                toast({ title: `${label} copied` });
              }}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ContactFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contact={editing}
        defaultKind={tab}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the contact from the directory. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}

function ContactList({
  contacts, loading, isAdmin, onEdit, onDelete, onCopy,
}: {
  contacts: Contact[];
  loading: boolean;
  isAdmin: boolean;
  onEdit: (c: Contact) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string, label: string) => void;
}) {
  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>;
  }
  if (contacts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No contacts yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {contacts.map((c) => (
        <Card key={c.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-foreground truncate">{c.company_name}</h3>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                  {c.city && <span>{c.city}</span>}
                  {c.city && c.country && <span>·</span>}
                  {c.country && <span>{c.country}</span>}
                </div>
              </div>
              <Badge variant="outline" className="capitalize text-[10px]">{c.kind}</Badge>
            </div>

            <div className="space-y-1.5 text-xs">
              {c.vat_number && (
                <CopyableRow label="VAT" value={c.vat_number} onCopy={onCopy} />
              )}
              {c.email && (
                <CopyableRow label="Email" value={c.email} onCopy={onCopy} />
              )}
              {c.phone && (
                <CopyableRow label="Phone" value={c.phone} onCopy={onCopy} />
              )}
              {c.iban && (
                <CopyableRow label="IBAN" value={c.iban} onCopy={onCopy} />
              )}
              {c.primary_contact_name && (
                <div className="text-muted-foreground pt-1">
                  Contact: <span className="text-foreground">{c.primary_contact_name}</span>
                  {c.primary_contact_role && <span className="text-muted-foreground"> · {c.primary_contact_role}</span>}
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="flex justify-end gap-1.5 pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => onEdit(c)} className="h-7 px-2">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(c.id)} className="h-7 px-2 text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CopyableRow({ label, value, onCopy }: { label: string; value: string; onCopy: (text: string, label: string) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 group">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
        <span className="truncate text-foreground">{value}</span>
        <button
          onClick={() => {
            onCopy(value, label);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}
