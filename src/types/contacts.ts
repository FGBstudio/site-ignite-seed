export type ContactKind = "client" | "supplier";

export interface Contact {
  id: string;
  kind: ContactKind;
  company_name: string;
  vat_number: string | null;
  tax_code: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  pec: string | null;
  iban: string | null;
  bank_name: string | null;
  primary_contact_name: string | null;
  primary_contact_role: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  notes: string | null;
  brand_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ContactInput = Omit<Contact, "id" | "created_at" | "updated_at" | "created_by">;
