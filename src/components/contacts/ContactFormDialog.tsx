import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useCreateContact, useUpdateContact } from "@/hooks/useContacts";
import type { Contact, ContactInput, ContactKind } from "@/types/contacts";

const ContactSchema = z.object({
  kind: z.enum(["client", "supplier"]),
  company_name: z.string().trim().min(1, "Company name required").max(200),
  vat_number: z.string().trim().max(50).optional().or(z.literal("")),
  tax_code: z.string().trim().max(50).optional().or(z.literal("")),
  address: z.string().trim().max(255).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  country: z.string().trim().max(100).optional().or(z.literal("")),
  postal_code: z.string().trim().max(20).optional().or(z.literal("")),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  pec: z.string().trim().max(255).optional().or(z.literal("")),
  iban: z.string().trim().max(50).optional().or(z.literal("")),
  bank_name: z.string().trim().max(150).optional().or(z.literal("")),
  bank_account: z.string().trim().max(50).optional().or(z.literal("")),
  bic: z.string().trim().max(20).optional().or(z.literal("")),
  primary_contact_name: z.string().trim().max(150).optional().or(z.literal("")),
  primary_contact_role: z.string().trim().max(100).optional().or(z.literal("")),
  primary_contact_email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  primary_contact_phone: z.string().trim().max(50).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  defaultKind?: ContactKind;
  /** Brand a cui agganciare la societa'. Serve quando il dialogo si apre dal
   *  form dell'offerta: li' il brand e' gia' deciso dalla quotazione. */
  defaultBrandId?: string | null;
}

const emptyForm = (kind: ContactKind, brandId = ""): Record<string, string> => ({
  kind,
  brand_id: brandId,
  company_name: "", vat_number: "", tax_code: "",
  address: "", city: "", country: "", postal_code: "",
  website: "", email: "", phone: "", pec: "",
  iban: "", bank_name: "", bank_account: "", bic: "",
  primary_contact_name: "", primary_contact_role: "",
  primary_contact_email: "", primary_contact_phone: "",
  notes: "",
});

/** Il valore che Select usa per "nessuno": la stringa vuota non e' ammessa. */
const SENZA_BRAND = "__nessuno__";

export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  defaultKind = "client",
  defaultBrandId = null,
}: Props) {
  const { toast } = useToast();
  const create = useCreateContact();
  const update = useUpdateContact();
  const [form, setForm] = useState<Record<string, string>>(emptyForm(defaultKind));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // L'elenco dei brand serve solo a questo dialogo: si carica quando si apre.
  const { data: brands = [] } = useQuery({
    queryKey: ["brands", "elenco"],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  useEffect(() => {
    if (!open) return;
    if (contact) {
      setForm({
        kind: contact.kind,
        brand_id: contact.brand_id ?? "",
        company_name: contact.company_name ?? "",
        vat_number: contact.vat_number ?? "",
        tax_code: contact.tax_code ?? "",
        address: contact.address ?? "",
        city: contact.city ?? "",
        country: contact.country ?? "",
        postal_code: contact.postal_code ?? "",
        website: contact.website ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        pec: contact.pec ?? "",
        iban: contact.iban ?? "",
        bank_name: contact.bank_name ?? "",
        bank_account: contact.bank_account ?? "",
        bic: contact.bic ?? "",
        primary_contact_name: contact.primary_contact_name ?? "",
        primary_contact_role: contact.primary_contact_role ?? "",
        primary_contact_email: contact.primary_contact_email ?? "",
        primary_contact_phone: contact.primary_contact_phone ?? "",
        notes: contact.notes ?? "",
      });
    } else {
      setForm(emptyForm(defaultKind, defaultBrandId ?? ""));
    }
    setErrors({});
  }, [open, contact, defaultKind, defaultBrandId]);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    const parsed = ContactSchema.safeParse(form);
    if (!parsed.success) {
      const errMap: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const k = i.path.join(".");
        errMap[k] = i.message;
      });
      setErrors(errMap);
      return;
    }
    setErrors({});

    const toNullable = (v: string) => (v.trim() ? v.trim() : null);
    const payload: ContactInput = {
      kind: parsed.data.kind as ContactKind,
      company_name: parsed.data.company_name.trim(),
      vat_number: toNullable(parsed.data.vat_number || ""),
      tax_code: toNullable(parsed.data.tax_code || ""),
      address: toNullable(parsed.data.address || ""),
      city: toNullable(parsed.data.city || ""),
      country: toNullable(parsed.data.country || ""),
      postal_code: toNullable(parsed.data.postal_code || ""),
      website: toNullable(parsed.data.website || ""),
      email: toNullable(parsed.data.email || ""),
      phone: toNullable(parsed.data.phone || ""),
      pec: toNullable(parsed.data.pec || ""),
      iban: toNullable(parsed.data.iban || ""),
      bank_name: toNullable(parsed.data.bank_name || ""),
      bank_account: toNullable(parsed.data.bank_account || ""),
      bic: toNullable(parsed.data.bic || ""),
      primary_contact_name: toNullable(parsed.data.primary_contact_name || ""),
      primary_contact_role: toNullable(parsed.data.primary_contact_role || ""),
      primary_contact_email: toNullable(parsed.data.primary_contact_email || ""),
      primary_contact_phone: toNullable(parsed.data.primary_contact_phone || ""),
      notes: toNullable(parsed.data.notes || ""),
      // Il brand ora si sceglie: era trasportato e basta, quindi ogni societa'
      // nuova nasceva senza, e la tendina dell'offerta non aveva niente da
      // mostrare.
      brand_id: toNullable(form.brand_id || ""),
    };

    try {
      if (contact) {
        await update.mutateAsync({ id: contact.id, ...payload });
        toast({ title: "Contact updated" });
      } else {
        await create.mutateAsync(payload);
        toast({ title: "Contact created" });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    }
  };

  const saving = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "New contact"}</DialogTitle>
          <DialogDescription>
            Centralised client and supplier directory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Kind + company */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select value={form.kind} onValueChange={(v) => set("kind", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/*
              Il brand a cui appartiene la societa'.
              PRADA e' un marchio, "Prada Retail Italia S.p.A." e' chi paga:
              questo campo tiene insieme i due. Scelto il brand su una
              quotazione, l'offerta propone le societa' agganciate qui.
            */}
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Select
                value={form.brand_id || SENZA_BRAND}
                onValueChange={(v) => set("brand_id", v === SENZA_BRAND ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nessuno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SENZA_BRAND}>Nessuno</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Senza brand la società non comparirà fra quelle proponibili in offerta.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Company name *</Label>
              <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
              {errors.company_name && <p className="text-xs text-destructive">{errors.company_name}</p>}
            </div>
          </section>

          {/* Tax info */}
          <section>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Tax information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="VAT number" value={form.vat_number} onChange={(v) => set("vat_number", v)} />
              <Field label="Tax code / SDI" value={form.tax_code} onChange={(v) => set("tax_code", v)} />
              <Field label="PEC" value={form.pec} onChange={(v) => set("pec", v)} error={errors.pec} />
              <Field label="Website" value={form.website} onChange={(v) => set("website", v)} />
            </div>
          </section>

          {/* Address */}
          <section>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Address</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Address" value={form.address} onChange={(v) => set("address", v)} />
              <Field label="City" value={form.city} onChange={(v) => set("city", v)} />
              <Field label="Postal code" value={form.postal_code} onChange={(v) => set("postal_code", v)} />
              <Field label="Country" value={form.country} onChange={(v) => set("country", v)} />
            </div>
          </section>

          {/* Banking */}
          <section>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Banking</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="IBAN" value={form.iban} onChange={(v) => set("iban", v)} />
              <Field label="Bank name" value={form.bank_name} onChange={(v) => set("bank_name", v)} />
              {/* Conto e BIC completano il blocco bancario che la fattura
                  stampa: senza, per una società nuova quelle righe uscirebbero
                  vuote e non ci sarebbe nessun posto dove riempirle. */}
              <Field label="Account number" value={form.bank_account} onChange={(v) => set("bank_account", v)} />
              <Field label="BIC / SWIFT" value={form.bic} onChange={(v) => set("bic", v)} />
            </div>
          </section>

          {/* Primary contact */}
          <section>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Primary contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Name" value={form.primary_contact_name} onChange={(v) => set("primary_contact_name", v)} />
              <Field label="Role" value={form.primary_contact_role} onChange={(v) => set("primary_contact_role", v)} />
              <Field label="Email" value={form.primary_contact_email} onChange={(v) => set("primary_contact_email", v)} error={errors.primary_contact_email} />
              <Field label="Phone" value={form.primary_contact_phone} onChange={(v) => set("primary_contact_phone", v)} />
            </div>
          </section>

          {/* General contact */}
          <section>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">General contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Email" value={form.email} onChange={(v) => set("email", v)} error={errors.email} />
              <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} />
            </div>
          </section>

          {/* Notes */}
          <section className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Internal notes…"
            />
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {contact ? "Save changes" : "Create contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
