export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          company: string
          created_at: string | null
          email: string
          first_name: string
          id: string
          job_title: string | null
          last_name: string
          message: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          company: string
          created_at?: string | null
          email: string
          first_name: string
          id?: string
          job_title?: string | null
          last_name: string
          message?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          company?: string
          created_at?: string | null
          email?: string
          first_name?: string
          id?: string
          job_title?: string | null
          last_name?: string
          message?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      alert_audit_log: {
        Row: {
          action: string
          alert_id: string | null
          changed_at: string | null
          changed_by: string | null
          details: Json | null
          device_id: string | null
          id: string
          metric: string | null
          new_status: string | null
          prev_status: string | null
          rule_id: string | null
          severity: string | null
          site_alert_id: string | null
          site_id: string | null
        }
        Insert: {
          action: string
          alert_id?: string | null
          changed_at?: string | null
          changed_by?: string | null
          details?: Json | null
          device_id?: string | null
          id?: string
          metric?: string | null
          new_status?: string | null
          prev_status?: string | null
          rule_id?: string | null
          severity?: string | null
          site_alert_id?: string | null
          site_id?: string | null
        }
        Update: {
          action?: string
          alert_id?: string | null
          changed_at?: string | null
          changed_by?: string | null
          details?: Json | null
          device_id?: string | null
          id?: string
          metric?: string | null
          new_status?: string | null
          prev_status?: string | null
          rule_id?: string | null
          severity?: string | null
          site_alert_id?: string | null
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_audit_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_audit_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_audit_log_site_alert_id_fkey"
            columns: ["site_alert_id"]
            isOneToOne: false
            referencedRelation: "site_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_audit_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          building_type: string | null
          condition: string
          created_at: string | null
          device_type: string | null
          duration_minutes: number | null
          enabled: boolean | null
          hysteresis: number | null
          hysteresis_pct: number | null
          id: string
          message_template: string
          metric: string
          recommendation_template: string | null
          severity: string | null
          site_id: string | null
          threshold: number
        }
        Insert: {
          building_type?: string | null
          condition?: string
          created_at?: string | null
          device_type?: string | null
          duration_minutes?: number | null
          enabled?: boolean | null
          hysteresis?: number | null
          hysteresis_pct?: number | null
          id?: string
          message_template: string
          metric: string
          recommendation_template?: string | null
          severity?: string | null
          site_id?: string | null
          threshold: number
        }
        Update: {
          building_type?: string | null
          condition?: string
          created_at?: string | null
          device_type?: string | null
          duration_minutes?: number | null
          enabled?: boolean | null
          hysteresis?: number | null
          hysteresis_pct?: number | null
          id?: string
          message_template?: string
          metric?: string
          recommendation_template?: string | null
          severity?: string | null
          site_id?: string | null
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          certification_id: string | null
          changed_field: string
          created_at: string
          id: string
          new_value: string | null
          old_value: string | null
          user_id: string | null
        }
        Insert: {
          certification_id?: string | null
          changed_field: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_id?: string | null
        }
        Update: {
          certification_id?: string | null
          changed_field?: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_data: {
        Row: {
          additional_data: Json | null
          bill_id: string
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string
          currency: string | null
          energy_consumption_kwh: number | null
          energy_cost_per_kwh: number | null
          fixed_charges: number | null
          id: string
          off_peak_consumption_kwh: number | null
          peak_consumption_kwh: number | null
          peak_power_kw: number | null
          power_factor: number | null
          reactive_energy_kvarh: number | null
          taxes: number | null
          total_amount: number | null
          total_energy_cost: number | null
        }
        Insert: {
          additional_data?: Json | null
          bill_id: string
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          currency?: string | null
          energy_consumption_kwh?: number | null
          energy_cost_per_kwh?: number | null
          fixed_charges?: number | null
          id?: string
          off_peak_consumption_kwh?: number | null
          peak_consumption_kwh?: number | null
          peak_power_kw?: number | null
          power_factor?: number | null
          reactive_energy_kvarh?: number | null
          taxes?: number | null
          total_amount?: number | null
          total_energy_cost?: number | null
        }
        Update: {
          additional_data?: Json | null
          bill_id?: string
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          currency?: string | null
          energy_consumption_kwh?: number | null
          energy_cost_per_kwh?: number | null
          fixed_charges?: number | null
          id?: string
          off_peak_consumption_kwh?: number | null
          peak_consumption_kwh?: number | null
          peak_power_kw?: number | null
          power_factor?: number | null
          reactive_energy_kvarh?: number | null
          taxes?: number | null
          total_amount?: number | null
          total_energy_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_data_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          company_name: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          site_id: string
          status: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_name: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          site_id: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_name?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          site_id?: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string | null
          holding_id: string
          id: string
          logo_url: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          holding_id: string
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          holding_id?: string
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      cert_payment_milestones: {
        Row: {
          amount: number
          certification_id: string
          created_at: string
          due_date: string | null
          id: string
          invoice_sent_by: string | null
          invoice_sent_date: string | null
          name: string
          payment_received_by: string | null
          payment_received_date: string | null
          payment_scheme: string | null
          status: string
          tranche_order: number | null
          tranche_pct: number | null
          trigger_event: string | null
          trigger_task_id: string | null
        }
        Insert: {
          amount?: number
          certification_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_sent_by?: string | null
          invoice_sent_date?: string | null
          name: string
          payment_received_by?: string | null
          payment_received_date?: string | null
          payment_scheme?: string | null
          status?: string
          tranche_order?: number | null
          tranche_pct?: number | null
          trigger_event?: string | null
          trigger_task_id?: string | null
        }
        Update: {
          amount?: number
          certification_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_sent_by?: string | null
          invoice_sent_date?: string | null
          name?: string
          payment_received_by?: string | null
          payment_received_date?: string | null
          payment_scheme?: string | null
          status?: string
          tranche_order?: number | null
          tranche_pct?: number | null
          trigger_event?: string | null
          trigger_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cert_payment_milestones_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cert_payment_milestones_trigger_task_id_fkey"
            columns: ["trigger_task_id"]
            isOneToOne: false
            referencedRelation: "cert_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      cert_task_checklists: {
        Row: {
          id: string
          is_completed: boolean
          requirement_text: string
          task_id: string
        }
        Insert: {
          id?: string
          is_completed?: boolean
          requirement_text: string
          task_id: string
        }
        Update: {
          id?: string
          is_completed?: boolean
          requirement_text?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cert_task_checklists_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "cert_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      cert_tasks: {
        Row: {
          assignee_id: string | null
          certification_id: string
          created_at: string
          dependencies: string[] | null
          description: string | null
          end_date: string | null
          id: string
          phase_id: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          certification_id: string
          created_at?: string
          dependencies?: string[] | null
          description?: string | null
          end_date?: string | null
          id?: string
          phase_id?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          certification_id?: string
          created_at?: string
          dependencies?: string[] | null
          description?: string | null
          end_date?: string | null
          id?: string
          phase_id?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cert_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cert_tasks_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cert_tasks_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "cert_wbs_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      cert_wbs_phases: {
        Row: {
          certification_id: string
          created_at: string
          id: string
          name: string
          order_index: number
          updated_at: string
        }
        Insert: {
          certification_id: string
          created_at?: string
          id?: string
          name: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          certification_id?: string
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cert_wbs_phases_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_milestones: {
        Row: {
          actual_date: string | null
          category: string
          certification_id: string
          completed_date: string | null
          created_at: string | null
          due_date: string | null
          edit_locked_for_pm: boolean
          evidence_url: string | null
          id: string
          max_score: number | null
          milestone_type:
            | Database["public"]["Enums"]["milestone_category"]
            | null
          notes: string | null
          order_index: number | null
          requirement: string
          score: number | null
          start_date: string | null
          status: string | null
        }
        Insert: {
          actual_date?: string | null
          category: string
          certification_id: string
          completed_date?: string | null
          created_at?: string | null
          due_date?: string | null
          edit_locked_for_pm?: boolean
          evidence_url?: string | null
          id?: string
          max_score?: number | null
          milestone_type?:
            | Database["public"]["Enums"]["milestone_category"]
            | null
          notes?: string | null
          order_index?: number | null
          requirement: string
          score?: number | null
          start_date?: string | null
          status?: string | null
        }
        Update: {
          actual_date?: string | null
          category?: string
          certification_id?: string
          completed_date?: string | null
          created_at?: string | null
          due_date?: string | null
          edit_locked_for_pm?: boolean
          evidence_url?: string | null
          id?: string
          max_score?: number | null
          milestone_type?:
            | Database["public"]["Enums"]["milestone_category"]
            | null
          notes?: string | null
          order_index?: number | null
          requirement?: string
          score?: number | null
          start_date?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certification_milestones_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
        ]
      }
      certifications: {
        Row: {
          actual_handover_date: string | null
          categories: Json | null
          cert_level: string | null
          cert_rating: string | null
          cert_type: string
          client: string
          created_at: string | null
          expiry_date: string | null
          fgb_monitor: boolean
          gbci_fees: number | null
          handover_date: string
          id: string
          is_commissioning: boolean | null
          issued_date: string | null
          level: string | null
          name: string | null
          planned_handover_date: string | null
          pm_id: string | null
          po_sign_date: string | null
          project_subtype: string | null
          quotation_notes: string | null
          quotation_sent_date: string | null
          region: string
          score: number | null
          services_fees: number | null
          site_id: string
          sqm: number | null
          status: string | null
          target_score: number | null
          total_fees: number | null
          updated_at: string | null
        }
        Insert: {
          actual_handover_date?: string | null
          categories?: Json | null
          cert_level?: string | null
          cert_rating?: string | null
          cert_type: string
          client?: string
          created_at?: string | null
          expiry_date?: string | null
          fgb_monitor?: boolean
          gbci_fees?: number | null
          handover_date?: string
          id?: string
          is_commissioning?: boolean | null
          issued_date?: string | null
          level?: string | null
          name?: string | null
          planned_handover_date?: string | null
          pm_id?: string | null
          po_sign_date?: string | null
          project_subtype?: string | null
          quotation_notes?: string | null
          quotation_sent_date?: string | null
          region?: string
          score?: number | null
          services_fees?: number | null
          site_id: string
          sqm?: number | null
          status?: string | null
          target_score?: number | null
          total_fees?: number | null
          updated_at?: string | null
        }
        Update: {
          actual_handover_date?: string | null
          categories?: Json | null
          cert_level?: string | null
          cert_rating?: string | null
          cert_type?: string
          client?: string
          created_at?: string | null
          expiry_date?: string | null
          fgb_monitor?: boolean
          gbci_fees?: number | null
          handover_date?: string
          id?: string
          is_commissioning?: boolean | null
          issued_date?: string | null
          level?: string | null
          name?: string | null
          planned_handover_date?: string | null
          pm_id?: string | null
          po_sign_date?: string | null
          project_subtype?: string | null
          quotation_notes?: string | null
          quotation_sent_date?: string | null
          region?: string
          score?: number | null
          services_fees?: number | null
          site_id?: string
          sqm?: number | null
          status?: string | null
          target_score?: number | null
          total_fees?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certifications_pm_id_fkey"
            columns: ["pm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          bank_name: string | null
          brand_id: string | null
          city: string | null
          company_name: string
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          iban: string | null
          id: string
          kind: string
          notes: string | null
          pec: string | null
          phone: string | null
          postal_code: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          primary_contact_role: string | null
          tax_code: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_name?: string | null
          brand_id?: string | null
          city?: string | null
          company_name: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          kind: string
          notes?: string | null
          pec?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          primary_contact_role?: string | null
          tax_code?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_name?: string | null
          brand_id?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          kind?: string
          notes?: string | null
          pec?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          primary_contact_role?: string | null
          tax_code?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      device_migration_log: {
        Row: {
          id: number
          mac_device_id: string | null
          mac_site_id: string | null
          migrated_at: string | null
          new_device_id: string
          old_device_id: string
          serial: string | null
          serial_site_id: string | null
        }
        Insert: {
          id?: number
          mac_device_id?: string | null
          mac_site_id?: string | null
          migrated_at?: string | null
          new_device_id: string
          old_device_id: string
          serial?: string | null
          serial_site_id?: string | null
        }
        Update: {
          id?: number
          mac_device_id?: string | null
          mac_site_id?: string | null
          migrated_at?: string | null
          new_device_id?: string
          old_device_id?: string
          serial?: string | null
          serial_site_id?: string | null
        }
        Relationships: []
      }
      device_provisioning_map: {
        Row: {
          created_at: string | null
          device_external_id: string
          id: number
          mac_address: string | null
          project_name: string | null
          site_uuid: string | null
        }
        Insert: {
          created_at?: string | null
          device_external_id: string
          id?: number
          mac_address?: string | null
          project_name?: string | null
          site_uuid?: string | null
        }
        Update: {
          created_at?: string | null
          device_external_id?: string
          id?: number
          mac_address?: string | null
          project_name?: string | null
          site_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_provisioning_map_site_uuid_fkey"
            columns: ["site_uuid"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      device_serial_mac_map: {
        Row: {
          mac: string
          serial: string
        }
        Insert: {
          mac: string
          serial: string
        }
        Update: {
          mac?: string
          serial?: string
        }
        Relationships: []
      }
      device_serial_mac_map_persistent: {
        Row: {
          mac: string
          serial: string
        }
        Insert: {
          mac: string
          serial: string
        }
        Update: {
          mac?: string
          serial?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          broker: string | null
          category: string | null
          circuit_name: string | null
          created_at: string | null
          device_id: string
          device_type: Database["public"]["Enums"]["device_type"]
          firmware_version: string | null
          id: string
          last_seen: string | null
          location: string | null
          mac_address: string | null
          metadata: Json | null
          model: string | null
          name: string | null
          rssi_dbm: number | null
          site_id: string | null
          status: Database["public"]["Enums"]["device_status"] | null
          topic: string | null
          updated_at: string | null
        }
        Insert: {
          broker?: string | null
          category?: string | null
          circuit_name?: string | null
          created_at?: string | null
          device_id: string
          device_type: Database["public"]["Enums"]["device_type"]
          firmware_version?: string | null
          id?: string
          last_seen?: string | null
          location?: string | null
          mac_address?: string | null
          metadata?: Json | null
          model?: string | null
          name?: string | null
          rssi_dbm?: number | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["device_status"] | null
          topic?: string | null
          updated_at?: string | null
        }
        Update: {
          broker?: string | null
          category?: string | null
          circuit_name?: string | null
          created_at?: string | null
          device_id?: string
          device_type?: Database["public"]["Enums"]["device_type"]
          firmware_version?: string | null
          id?: string
          last_seen?: string | null
          location?: string | null
          mac_address?: string | null
          metadata?: Json | null
          model?: string | null
          name?: string | null
          rssi_dbm?: number | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["device_status"] | null
          topic?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          id: string
          message_id: string
          metadata: Json
          provider_message_id: string | null
          queue_name: string | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          message_id: string
          metadata?: Json
          provider_message_id?: string | null
          queue_name?: string | null
          recipient_email: string
          status?: string
          template_name: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string
          metadata?: Json
          provider_message_id?: string | null
          queue_name?: string | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          created_at: string
          id: number
          max_attempts: number
          rate_limited_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          created_at?: string
          id?: number
          max_attempts?: number
          rate_limited_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          created_at?: string
          id?: number
          max_attempts?: number
          rate_limited_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string | null
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string | null
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      energy_daily: {
        Row: {
          device_id: string
          id: string
          labels: Json | null
          metric: string
          sample_count: number | null
          site_id: string | null
          ts_day: string
          unit: string | null
          value_avg: number | null
          value_max: number | null
          value_min: number | null
          value_sum: number | null
        }
        Insert: {
          device_id: string
          id?: string
          labels?: Json | null
          metric: string
          sample_count?: number | null
          site_id?: string | null
          ts_day: string
          unit?: string | null
          value_avg?: number | null
          value_max?: number | null
          value_min?: number | null
          value_sum?: number | null
        }
        Update: {
          device_id?: string
          id?: string
          labels?: Json | null
          metric?: string
          sample_count?: number | null
          site_id?: string | null
          ts_day?: string
          unit?: string | null
          value_avg?: number | null
          value_max?: number | null
          value_min?: number | null
          value_sum?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_daily_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_hourly: {
        Row: {
          device_id: string
          id: string
          labels: Json | null
          metric: string
          sample_count: number | null
          site_id: string | null
          ts_hour: string
          unit: string | null
          value_avg: number | null
          value_max: number | null
          value_min: number | null
          value_sum: number | null
        }
        Insert: {
          device_id: string
          id?: string
          labels?: Json | null
          metric: string
          sample_count?: number | null
          site_id?: string | null
          ts_hour: string
          unit?: string | null
          value_avg?: number | null
          value_max?: number | null
          value_min?: number | null
          value_sum?: number | null
        }
        Update: {
          device_id?: string
          id?: string
          labels?: Json | null
          metric?: string
          sample_count?: number | null
          site_id?: string | null
          ts_hour?: string
          unit?: string | null
          value_avg?: number | null
          value_max?: number | null
          value_min?: number | null
          value_sum?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_hourly_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_hourly_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_latest: {
        Row: {
          device_id: string
          metric: string
          quality: string | null
          site_id: string | null
          ts: string
          unit: string | null
          value: number
        }
        Insert: {
          device_id: string
          metric: string
          quality?: string | null
          site_id?: string | null
          ts: string
          unit?: string | null
          value: number
        }
        Update: {
          device_id?: string
          metric?: string
          quality?: string | null
          site_id?: string | null
          ts?: string
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "energy_latest_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_latest_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_site_config: {
        Row: {
          historical_total_device_id: string
          live_device_ids: string[]
          merge_policy: string
          site_id: string
          timezone: string
        }
        Insert: {
          historical_total_device_id: string
          live_device_ids: string[]
          merge_policy?: string
          site_id: string
          timezone?: string
        }
        Update: {
          historical_total_device_id?: string
          live_device_ids?: string[]
          merge_policy?: string
          site_id?: string
          timezone?: string
        }
        Relationships: []
      }
      energy_site_daily: {
        Row: {
          computed_at: string
          day_local: string
          day_utc: string
          devices_count: number | null
          metric: string
          points: number | null
          site_id: string
          source: string
          unit: string | null
          value: number
        }
        Insert: {
          computed_at?: string
          day_local: string
          day_utc: string
          devices_count?: number | null
          metric: string
          points?: number | null
          site_id: string
          source: string
          unit?: string | null
          value: number
        }
        Update: {
          computed_at?: string
          day_local?: string
          day_utc?: string
          devices_count?: number | null
          metric?: string
          points?: number | null
          site_id?: string
          source?: string
          unit?: string | null
          value?: number
        }
        Relationships: []
      }
      energy_site_device_allowlist: {
        Row: {
          device_id: string
          site_id: string
        }
        Insert: {
          device_id: string
          site_id: string
        }
        Update: {
          device_id?: string
          site_id?: string
        }
        Relationships: []
      }
      energy_site_hourly: {
        Row: {
          computed_at: string
          devices_count: number | null
          hour_local: string
          hour_utc: string
          metric: string
          points: number | null
          site_id: string
          source: string
          unit: string | null
          value: number
        }
        Insert: {
          computed_at?: string
          devices_count?: number | null
          hour_local: string
          hour_utc: string
          metric: string
          points?: number | null
          site_id: string
          source: string
          unit?: string | null
          value: number
        }
        Update: {
          computed_at?: string
          devices_count?: number | null
          hour_local?: string
          hour_utc?: string
          metric?: string
          points?: number | null
          site_id?: string
          source?: string
          unit?: string | null
          value?: number
        }
        Relationships: []
      }
      energy_telemetry: {
        Row: {
          device_id: string
          id: string
          labels: Json | null
          metric: string
          quality: string | null
          site_id: string | null
          ts: string
          unit: string | null
          value: number
        }
        Insert: {
          device_id: string
          id?: string
          labels?: Json | null
          metric: string
          quality?: string | null
          site_id?: string | null
          ts?: string
          unit?: string | null
          value: number
        }
        Update: {
          device_id?: string
          id?: string
          labels?: Json | null
          metric?: string
          quality?: string | null
          site_id?: string | null
          ts?: string
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "energy_telemetry_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_telemetry_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_telemetry_swapfix_backup: {
        Row: {
          device_id: string
          id: string
          labels: Json | null
          metric: string
          quality: string | null
          site_id: string | null
          ts: string
          unit: string | null
          value: number
        }
        Insert: {
          device_id: string
          id?: string
          labels?: Json | null
          metric: string
          quality?: string | null
          site_id?: string | null
          ts?: string
          unit?: string | null
          value: number
        }
        Update: {
          device_id?: string
          id?: string
          labels?: Json | null
          metric?: string
          quality?: string | null
          site_id?: string | null
          ts?: string
          unit?: string | null
          value?: number
        }
        Relationships: []
      }
      energy_telemetry_ts_backup: {
        Row: {
          device_id: string
          id: string
          labels: Json | null
          metric: string
          quality: string | null
          site_id: string | null
          ts: string
          unit: string | null
          value: number
        }
        Insert: {
          device_id: string
          id?: string
          labels?: Json | null
          metric: string
          quality?: string | null
          site_id?: string | null
          ts?: string
          unit?: string | null
          value: number
        }
        Update: {
          device_id?: string
          id?: string
          labels?: Json | null
          metric?: string
          quality?: string | null
          site_id?: string | null
          ts?: string
          unit?: string | null
          value?: number
        }
        Relationships: []
      }
      events: {
        Row: {
          acknowledged_by: string | null
          device_id: string | null
          event_type: string
          id: string
          message: string | null
          metadata: Json | null
          metric: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["event_severity"]
          site_id: string | null
          status: Database["public"]["Enums"]["event_status"]
          threshold: number | null
          title: string
          ts_acknowledged: string | null
          ts_created: string
          ts_resolved: string | null
          value: number | null
        }
        Insert: {
          acknowledged_by?: string | null
          device_id?: string | null
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json | null
          metric?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["event_severity"]
          site_id?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          threshold?: number | null
          title: string
          ts_acknowledged?: string | null
          ts_created?: string
          ts_resolved?: string | null
          value?: number | null
        }
        Update: {
          acknowledged_by?: string | null
          device_id?: string | null
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          metric?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["event_severity"]
          site_id?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          threshold?: number | null
          title?: string
          ts_acknowledged?: string | null
          ts_created?: string
          ts_resolved?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      hardware_status_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          hardware_id: string | null
          id: string
          new_status:
            | Database["public"]["Enums"]["hardware_fulfillment_status"]
            | null
          notes: string | null
          previous_status:
            | Database["public"]["Enums"]["hardware_fulfillment_status"]
            | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          hardware_id?: string | null
          id?: string
          new_status?:
            | Database["public"]["Enums"]["hardware_fulfillment_status"]
            | null
          notes?: string | null
          previous_status?:
            | Database["public"]["Enums"]["hardware_fulfillment_status"]
            | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          hardware_id?: string | null
          id?: string
          new_status?:
            | Database["public"]["Enums"]["hardware_fulfillment_status"]
            | null
          notes?: string | null
          previous_status?:
            | Database["public"]["Enums"]["hardware_fulfillment_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "hardware_status_history_hardware_id_fkey"
            columns: ["hardware_id"]
            isOneToOne: false
            referencedRelation: "hardwares"
            referencedColumns: ["id"]
          },
        ]
      }
      hardwares: {
        Row: {
          carrier_name: string | null
          category: string | null
          country: string | null
          created_at: string
          delivery_person: string | null
          device_id: string
          fulfillment_status:
            | Database["public"]["Enums"]["hardware_fulfillment_status"]
            | null
          hardware_type: string | null
          id: string
          logistics_details: string | null
          mac_address: string | null
          notes: string | null
          po: string | null
          po_number_link: string | null
          product_id: string | null
          purchase_order_id: string | null
          region: string | null
          shipment_date: string | null
          shipment_group_id: string | null
          shipment_mode: string | null
          shipped_by: string | null
          shipping_cost: number | null
          shipping_currency: string | null
          site_id: string | null
          status: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          carrier_name?: string | null
          category?: string | null
          country?: string | null
          created_at?: string
          delivery_person?: string | null
          device_id: string
          fulfillment_status?:
            | Database["public"]["Enums"]["hardware_fulfillment_status"]
            | null
          hardware_type?: string | null
          id?: string
          logistics_details?: string | null
          mac_address?: string | null
          notes?: string | null
          po?: string | null
          po_number_link?: string | null
          product_id?: string | null
          purchase_order_id?: string | null
          region?: string | null
          shipment_date?: string | null
          shipment_group_id?: string | null
          shipment_mode?: string | null
          shipped_by?: string | null
          shipping_cost?: number | null
          shipping_currency?: string | null
          site_id?: string | null
          status?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          carrier_name?: string | null
          category?: string | null
          country?: string | null
          created_at?: string
          delivery_person?: string | null
          device_id?: string
          fulfillment_status?:
            | Database["public"]["Enums"]["hardware_fulfillment_status"]
            | null
          hardware_type?: string | null
          id?: string
          logistics_details?: string | null
          mac_address?: string | null
          notes?: string | null
          po?: string | null
          po_number_link?: string | null
          product_id?: string | null
          purchase_order_id?: string | null
          region?: string | null
          shipment_date?: string | null
          shipment_group_id?: string | null
          shipment_mode?: string | null
          shipped_by?: string | null
          shipping_cost?: number | null
          shipping_currency?: string | null
          site_id?: string | null
          status?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hardwares_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hardwares_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "ops_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hardwares_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_energy: {
        Row: {
          circuit_name: string | null
          created_at: string | null
          id: number
          metric_type: string | null
          project_name: string | null
          site_id: string | null
          timestamp: string
          unit: string | null
          value: number | null
        }
        Insert: {
          circuit_name?: string | null
          created_at?: string | null
          id?: number
          metric_type?: string | null
          project_name?: string | null
          site_id?: string | null
          timestamp: string
          unit?: string | null
          value?: number | null
        }
        Update: {
          circuit_name?: string | null
          created_at?: string | null
          id?: number
          metric_type?: string | null
          project_name?: string | null
          site_id?: string | null
          timestamp?: string
          unit?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_energy_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      holdings: {
        Row: {
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      mqtt_messages_raw: {
        Row: {
          broker: string
          device_external_id: string | null
          error_message: string | null
          id: number
          payload: Json
          processed: boolean | null
          received_at: string
          source_type: string | null
          topic: string
        }
        Insert: {
          broker: string
          device_external_id?: string | null
          error_message?: string | null
          id?: number
          payload: Json
          processed?: boolean | null
          received_at?: string
          source_type?: string | null
          topic: string
        }
        Update: {
          broker?: string
          device_external_id?: string | null
          error_message?: string | null
          id?: number
          payload?: Json
          processed?: boolean | null
          received_at?: string
          source_type?: string | null
          topic?: string
        }
        Relationships: []
      }
      ops_hardware_movements: {
        Row: {
          action: string | null
          created_at: string | null
          hardware_id: string | null
          id: string
          shipment_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          hardware_id?: string | null
          id?: string
          shipment_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          hardware_id?: string | null
          id?: string
          shipment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_hardware_movements_hardware_id_fkey"
            columns: ["hardware_id"]
            isOneToOne: false
            referencedRelation: "hardwares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_hardware_movements_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "ops_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_locations: {
        Row: {
          country: string | null
          created_at: string | null
          id: string
          name: string
          region: string | null
          type: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string | null
          id?: string
          name: string
          region?: string | null
          type?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string | null
          id?: string
          name?: string
          region?: string | null
          type?: string | null
        }
        Relationships: []
      }
      ops_purchase_orders: {
        Row: {
          category: string | null
          created_at: string
          currency: string | null
          id: string
          notes: string | null
          payment_date: string | null
          payment_status: string | null
          po_cost: number | null
          po_issued_date: string | null
          po_number: string | null
          status: string | null
          supplier: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_status?: string | null
          po_cost?: number | null
          po_issued_date?: string | null
          po_number?: string | null
          status?: string | null
          supplier?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_status?: string | null
          po_cost?: number | null
          po_issued_date?: string | null
          po_number?: string | null
          status?: string | null
          supplier?: string | null
        }
        Relationships: []
      }
      ops_shipments: {
        Row: {
          carrier_name: string | null
          created_at: string | null
          currency: string | null
          customs_cost: number | null
          destination_location_id: string | null
          id: string
          notes: string | null
          origin_location_id: string | null
          purchase_order_id: string | null
          shipment_type: string | null
          shipped_date: string | null
          status: string | null
          total_shipping_cost: number | null
          tracking_number: string | null
        }
        Insert: {
          carrier_name?: string | null
          created_at?: string | null
          currency?: string | null
          customs_cost?: number | null
          destination_location_id?: string | null
          id?: string
          notes?: string | null
          origin_location_id?: string | null
          purchase_order_id?: string | null
          shipment_type?: string | null
          shipped_date?: string | null
          status?: string | null
          total_shipping_cost?: number | null
          tracking_number?: string | null
        }
        Update: {
          carrier_name?: string | null
          created_at?: string | null
          currency?: string | null
          customs_cost?: number | null
          destination_location_id?: string | null
          id?: string
          notes?: string | null
          origin_location_id?: string | null
          purchase_order_id?: string | null
          shipment_type?: string | null
          shipped_date?: string | null
          status?: string | null
          total_shipping_cost?: number | null
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_shipments_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "ops_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_shipments_origin_location_id_fkey"
            columns: ["origin_location_id"]
            isOneToOne: false
            referencedRelation: "ops_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_shipments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "ops_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      panel_config: {
        Row: {
          created_at: string | null
          device_id: string | null
          id: string
          metadata: Json | null
          name: string | null
          notes: string | null
          pf_default: number | null
          pf_l1: number | null
          pf_l2: number | null
          pf_l3: number | null
          site_id: string
          updated_at: string | null
          use_measured_pf: boolean | null
          use_measured_voltage: boolean | null
          vll_default: number | null
          vln_default: number | null
          wiring_type: Database["public"]["Enums"]["wiring_type"]
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          notes?: string | null
          pf_default?: number | null
          pf_l1?: number | null
          pf_l2?: number | null
          pf_l3?: number | null
          site_id: string
          updated_at?: string | null
          use_measured_pf?: boolean | null
          use_measured_voltage?: boolean | null
          vll_default?: number | null
          vln_default?: number | null
          wiring_type?: Database["public"]["Enums"]["wiring_type"]
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          notes?: string | null
          pf_default?: number | null
          pf_l1?: number | null
          pf_l2?: number | null
          pf_l3?: number | null
          site_id?: string
          updated_at?: string | null
          use_measured_pf?: boolean | null
          use_measured_voltage?: boolean | null
          vll_default?: number | null
          vln_default?: number | null
          wiring_type?: Database["public"]["Enums"]["wiring_type"]
        }
        Relationships: [
          {
            foreignKeyName: "panel_config_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_config_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_milestones: {
        Row: {
          amount: number
          certification_id: string
          created_at: string
          due_date: string | null
          id: string
          milestone_name: string
          status: string
        }
        Insert: {
          amount?: number
          certification_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          milestone_name?: string
          status?: string
        }
        Update: {
          amount?: number
          certification_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          milestone_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_milestones_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          certification: string
          created_at: string
          id: string
          name: string
          quantity_in_stock: number
          sku: string
          supplier_lead_time_days: number
        }
        Insert: {
          certification?: string
          created_at?: string
          id?: string
          name: string
          quantity_in_stock?: number
          sku: string
          supplier_lead_time_days?: number
        }
        Update: {
          certification?: string
          created_at?: string
          id?: string
          name?: string
          quantity_in_stock?: number
          sku?: string
          supplier_lead_time_days?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string | null
          display_name: string | null
          email: string
          first_name: string | null
          full_name: string | null
          id: string
          job_title: string | null
          last_name: string | null
          notify_escalations_email: boolean
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string | null
          display_name?: string | null
          email: string
          first_name?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          last_name?: string | null
          notify_escalations_email?: boolean
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          notify_escalations_email?: boolean
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      project_allocations: {
        Row: {
          certification_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          status: string
          target_date: string | null
        }
        Insert: {
          certification_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          status?: string
          target_date?: string | null
        }
        Update: {
          certification_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          status?: string
          target_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_allocations_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_allocations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      project_canvas_entries: {
        Row: {
          author_id: string
          certification_id: string
          content: string
          created_at: string
          entry_type: string
          id: string
          source_alert_id: string | null
        }
        Insert: {
          author_id: string
          certification_id: string
          content: string
          created_at?: string
          entry_type?: string
          id?: string
          source_alert_id?: string | null
        }
        Update: {
          author_id?: string
          certification_id?: string
          content?: string
          created_at?: string
          entry_type?: string
          id?: string
          source_alert_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_canvas_entries_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_canvas_entries_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          assigned_to: string | null
          blocking_payment_id: string | null
          certification_id: string
          created_at: string
          dependency_id: string | null
          end_date: string | null
          id: string
          start_date: string | null
          status: string
          task_name: string
        }
        Insert: {
          assigned_to?: string | null
          blocking_payment_id?: string | null
          certification_id: string
          created_at?: string
          dependency_id?: string | null
          end_date?: string | null
          id?: string
          start_date?: string | null
          status?: string
          task_name?: string
        }
        Update: {
          assigned_to?: string | null
          blocking_payment_id?: string | null
          certification_id?: string
          created_at?: string
          dependency_id?: string | null
          end_date?: string | null
          id?: string
          start_date?: string | null
          status?: string
          task_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_blocking_payment_id_fkey"
            columns: ["blocking_payment_id"]
            isOneToOne: false
            referencedRelation: "payment_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_dependency_id_fkey"
            columns: ["dependency_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          cert_level: string | null
          cert_rating: string | null
          cert_type: string | null
          certification_id: string | null
          client: string
          created_at: string
          handover_date: string
          id: string
          is_commissioning: boolean | null
          name: string
          pm_id: string | null
          project_subtype: string | null
          region: string
          site_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cert_level?: string | null
          cert_rating?: string | null
          cert_type?: string | null
          certification_id?: string | null
          client?: string
          created_at?: string
          handover_date?: string
          id?: string
          is_commissioning?: boolean | null
          name: string
          pm_id?: string | null
          project_subtype?: string | null
          region?: string
          site_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cert_level?: string | null
          cert_rating?: string | null
          cert_type?: string | null
          certification_id?: string | null
          client?: string
          created_at?: string
          handover_date?: string
          id?: string
          is_commissioning?: boolean | null
          name?: string
          pm_id?: string | null
          project_subtype?: string | null
          region?: string
          site_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_health: {
        Row: {
          flapping_count_24h: number | null
          flatline_started_at: string | null
          health_message: string | null
          is_degraded: boolean | null
          is_flatlining: boolean | null
          is_offline: boolean | null
          last_evaluated_at: string | null
          last_seen: string | null
          metadata: Json | null
          packet_loss_pct: number | null
          sensor_id: string
          site_id: string | null
          trust_score: number | null
        }
        Insert: {
          flapping_count_24h?: number | null
          flatline_started_at?: string | null
          health_message?: string | null
          is_degraded?: boolean | null
          is_flatlining?: boolean | null
          is_offline?: boolean | null
          last_evaluated_at?: string | null
          last_seen?: string | null
          metadata?: Json | null
          packet_loss_pct?: number | null
          sensor_id: string
          site_id?: string | null
          trust_score?: number | null
        }
        Update: {
          flapping_count_24h?: number | null
          flatline_started_at?: string | null
          health_message?: string | null
          is_degraded?: boolean | null
          is_flatlining?: boolean | null
          is_offline?: boolean | null
          last_evaluated_at?: string | null
          last_seen?: string | null
          metadata?: Json | null
          packet_loss_pct?: number | null
          sensor_id?: string
          site_id?: string | null
          trust_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sensor_health_sensor_id_fkey"
            columns: ["sensor_id"]
            isOneToOne: true
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_health_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_key: string
          current_value: number | null
          device_id: string | null
          id: string
          message: string
          metadata: Json | null
          metric: string
          recommendation: string | null
          resolved_at: string | null
          rule_id: string | null
          severity: string | null
          site_id: string
          status: string | null
          suppressed_until: string | null
          threshold_value: number | null
          triggered_at: string | null
          value_at_trigger: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_key: string
          current_value?: number | null
          device_id?: string | null
          id?: string
          message: string
          metadata?: Json | null
          metric: string
          recommendation?: string | null
          resolved_at?: string | null
          rule_id?: string | null
          severity?: string | null
          site_id: string
          status?: string | null
          suppressed_until?: string | null
          threshold_value?: number | null
          triggered_at?: string | null
          value_at_trigger?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_key?: string
          current_value?: number | null
          device_id?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          metric?: string
          recommendation?: string | null
          resolved_at?: string | null
          rule_id?: string | null
          severity?: string | null
          site_id?: string
          status?: string | null
          suppressed_until?: string | null
          threshold_value?: number | null
          triggered_at?: string | null
          value_at_trigger?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "site_alerts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_alerts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_alerts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_alerts_history: {
        Row: {
          alert_key: string | null
          archived_at: string | null
          device_id: string | null
          id: string
          message: string | null
          metadata: Json | null
          metric: string | null
          resolved_at: string | null
          rule_id: string | null
          severity: string | null
          site_id: string | null
          status: string | null
          triggered_at: string | null
          value_at_trigger: number | null
        }
        Insert: {
          alert_key?: string | null
          archived_at?: string | null
          device_id?: string | null
          id: string
          message?: string | null
          metadata?: Json | null
          metric?: string | null
          resolved_at?: string | null
          rule_id?: string | null
          severity?: string | null
          site_id?: string | null
          status?: string | null
          triggered_at?: string | null
          value_at_trigger?: number | null
        }
        Update: {
          alert_key?: string | null
          archived_at?: string | null
          device_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          metric?: string | null
          resolved_at?: string | null
          rule_id?: string | null
          severity?: string | null
          site_id?: string | null
          status?: string | null
          triggered_at?: string | null
          value_at_trigger?: number | null
        }
        Relationships: []
      }
      site_config: {
        Row: {
          created_at: string | null
          id: string
          site_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          site_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          site_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_config_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_device_config: {
        Row: {
          created_at: string
          device_id: string
          included: boolean
          priority: number
          role: string
          site_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          included?: boolean
          priority?: number
          role: string
          site_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          included?: boolean
          priority?: number
          role?: string
          site_id?: string
        }
        Relationships: []
      }
      site_kpis: {
        Row: {
          alerts_critical: number | null
          alerts_warning: number | null
          aq_co2_avg: number | null
          aq_co2_max: number | null
          aq_humidity_avg: number | null
          aq_index: string | null
          aq_pm10_avg: number | null
          aq_pm25_avg: number | null
          aq_temp_avg: number | null
          aq_voc_avg: number | null
          devices_critical: number | null
          devices_online: number | null
          devices_total: number | null
          energy_cost_usd: number | null
          energy_hvac_kwh: number | null
          energy_intensity_kwh_m2: number | null
          energy_lighting_kwh: number | null
          energy_plugs_kwh: number | null
          energy_total_kwh: number | null
          id: string
          metadata: Json | null
          metric: string | null
          period: string | null
          period_end: string | null
          period_start: string | null
          period_type: string | null
          site_id: string
          ts: string | null
          ts_computed: string
          value: number | null
          water_consumption_liters: number | null
          water_leak_count: number | null
          water_target_liters: number | null
        }
        Insert: {
          alerts_critical?: number | null
          alerts_warning?: number | null
          aq_co2_avg?: number | null
          aq_co2_max?: number | null
          aq_humidity_avg?: number | null
          aq_index?: string | null
          aq_pm10_avg?: number | null
          aq_pm25_avg?: number | null
          aq_temp_avg?: number | null
          aq_voc_avg?: number | null
          devices_critical?: number | null
          devices_online?: number | null
          devices_total?: number | null
          energy_cost_usd?: number | null
          energy_hvac_kwh?: number | null
          energy_intensity_kwh_m2?: number | null
          energy_lighting_kwh?: number | null
          energy_plugs_kwh?: number | null
          energy_total_kwh?: number | null
          id?: string
          metadata?: Json | null
          metric?: string | null
          period?: string | null
          period_end?: string | null
          period_start?: string | null
          period_type?: string | null
          site_id: string
          ts?: string | null
          ts_computed?: string
          value?: number | null
          water_consumption_liters?: number | null
          water_leak_count?: number | null
          water_target_liters?: number | null
        }
        Update: {
          alerts_critical?: number | null
          alerts_warning?: number | null
          aq_co2_avg?: number | null
          aq_co2_max?: number | null
          aq_humidity_avg?: number | null
          aq_index?: string | null
          aq_pm10_avg?: number | null
          aq_pm25_avg?: number | null
          aq_temp_avg?: number | null
          aq_voc_avg?: number | null
          devices_critical?: number | null
          devices_online?: number | null
          devices_total?: number | null
          energy_cost_usd?: number | null
          energy_hvac_kwh?: number | null
          energy_intensity_kwh_m2?: number | null
          energy_lighting_kwh?: number | null
          energy_plugs_kwh?: number | null
          energy_total_kwh?: number | null
          id?: string
          metadata?: Json | null
          metric?: string | null
          period?: string | null
          period_end?: string | null
          period_start?: string | null
          period_type?: string | null
          site_id?: string
          ts?: string | null
          ts_computed?: string
          value?: number | null
          water_consumption_liters?: number | null
          water_leak_count?: number | null
          water_target_liters?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "site_kpis_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_thresholds: {
        Row: {
          air_co_critical_ppm: number | null
          air_co_warning_ppm: number | null
          air_co2_critical_ppm: number | null
          air_co2_warning_ppm: number | null
          air_humidity_max_pct: number | null
          air_humidity_min_pct: number | null
          air_o3_critical_ppb: number | null
          air_o3_warning_ppb: number | null
          air_pm10_critical_ugm3: number | null
          air_pm10_warning_ugm3: number | null
          air_pm25_critical_ugm3: number | null
          air_pm25_warning_ugm3: number | null
          air_temp_max_c: number | null
          air_temp_min_c: number | null
          air_voc_critical_ppb: number | null
          air_voc_warning_ppb: number | null
          connectivity_offline_threshold_energy_min: number | null
          connectivity_offline_threshold_min: number | null
          created_at: string
          created_by: string | null
          energy_anomaly_detection_enabled: boolean | null
          energy_daily_budget_kwh: number | null
          energy_power_limit_kw: number | null
          energy_target_eui_kwh_m2: number | null
          id: string
          site_id: string
          updated_at: string
          updated_by: string | null
          water_daily_budget_liters: number | null
          water_leak_threshold_lh: number | null
        }
        Insert: {
          air_co_critical_ppm?: number | null
          air_co_warning_ppm?: number | null
          air_co2_critical_ppm?: number | null
          air_co2_warning_ppm?: number | null
          air_humidity_max_pct?: number | null
          air_humidity_min_pct?: number | null
          air_o3_critical_ppb?: number | null
          air_o3_warning_ppb?: number | null
          air_pm10_critical_ugm3?: number | null
          air_pm10_warning_ugm3?: number | null
          air_pm25_critical_ugm3?: number | null
          air_pm25_warning_ugm3?: number | null
          air_temp_max_c?: number | null
          air_temp_min_c?: number | null
          air_voc_critical_ppb?: number | null
          air_voc_warning_ppb?: number | null
          connectivity_offline_threshold_energy_min?: number | null
          connectivity_offline_threshold_min?: number | null
          created_at?: string
          created_by?: string | null
          energy_anomaly_detection_enabled?: boolean | null
          energy_daily_budget_kwh?: number | null
          energy_power_limit_kw?: number | null
          energy_target_eui_kwh_m2?: number | null
          id?: string
          site_id: string
          updated_at?: string
          updated_by?: string | null
          water_daily_budget_liters?: number | null
          water_leak_threshold_lh?: number | null
        }
        Update: {
          air_co_critical_ppm?: number | null
          air_co_warning_ppm?: number | null
          air_co2_critical_ppm?: number | null
          air_co2_warning_ppm?: number | null
          air_humidity_max_pct?: number | null
          air_humidity_min_pct?: number | null
          air_o3_critical_ppb?: number | null
          air_o3_warning_ppb?: number | null
          air_pm10_critical_ugm3?: number | null
          air_pm10_warning_ugm3?: number | null
          air_pm25_critical_ugm3?: number | null
          air_pm25_warning_ugm3?: number | null
          air_temp_max_c?: number | null
          air_temp_min_c?: number | null
          air_voc_critical_ppb?: number | null
          air_voc_warning_ppb?: number | null
          connectivity_offline_threshold_energy_min?: number | null
          connectivity_offline_threshold_min?: number | null
          created_at?: string
          created_by?: string | null
          energy_anomaly_detection_enabled?: boolean | null
          energy_daily_budget_kwh?: number | null
          energy_power_limit_kw?: number | null
          energy_target_eui_kwh_m2?: number | null
          id?: string
          site_id?: string
          updated_at?: string
          updated_by?: string | null
          water_daily_budget_liters?: number | null
          water_leak_threshold_lh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "site_thresholds_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_weather_energy_daily: {
        Row: {
          energy_kwh: number | null
          humidity_pct: number | null
          site_id: string
          temp_c: number | null
          ts_day: string
        }
        Insert: {
          energy_kwh?: number | null
          humidity_pct?: number | null
          site_id: string
          temp_c?: number | null
          ts_day: string
        }
        Update: {
          energy_kwh?: number | null
          humidity_pct?: number | null
          site_id?: string
          temp_c?: number | null
          ts_day?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_weather_energy_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_weather_energy_hourly: {
        Row: {
          energy_kwh: number | null
          humidity_pct: number | null
          site_id: string
          temp_c: number | null
          ts_hour: string
        }
        Insert: {
          energy_kwh?: number | null
          humidity_pct?: number | null
          site_id: string
          temp_c?: number | null
          ts_hour: string
        }
        Update: {
          energy_kwh?: number | null
          humidity_pct?: number | null
          site_id?: string
          temp_c?: number | null
          ts_hour?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_weather_energy_hourly_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          address: string | null
          area_m2: number | null
          brand_id: string
          city: string | null
          country: string | null
          created_at: string | null
          energy_price_kwh: number | null
          id: string
          image_url: string | null
          lat: number | null
          lng: number | null
          module_air_enabled: boolean | null
          module_air_show_demo: boolean | null
          module_bill_analysis_enabled: boolean | null
          module_energy_enabled: boolean | null
          module_energy_show_demo: boolean | null
          module_water_enabled: boolean | null
          module_water_show_demo: boolean | null
          monitoring_types: string[] | null
          name: string
          region: string | null
          timezone: string | null
          typology: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          area_m2?: number | null
          brand_id: string
          city?: string | null
          country?: string | null
          created_at?: string | null
          energy_price_kwh?: number | null
          id?: string
          image_url?: string | null
          lat?: number | null
          lng?: number | null
          module_air_enabled?: boolean | null
          module_air_show_demo?: boolean | null
          module_bill_analysis_enabled?: boolean | null
          module_energy_enabled?: boolean | null
          module_energy_show_demo?: boolean | null
          module_water_enabled?: boolean | null
          module_water_show_demo?: boolean | null
          monitoring_types?: string[] | null
          name: string
          region?: string | null
          timezone?: string | null
          typology?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          area_m2?: number | null
          brand_id?: string
          city?: string | null
          country?: string | null
          created_at?: string | null
          energy_price_kwh?: number | null
          id?: string
          image_url?: string | null
          lat?: number | null
          lng?: number | null
          module_air_enabled?: boolean | null
          module_air_show_demo?: boolean | null
          module_bill_analysis_enabled?: boolean | null
          module_energy_enabled?: boolean | null
          module_energy_show_demo?: boolean | null
          module_water_enabled?: boolean | null
          module_water_show_demo?: boolean | null
          monitoring_types?: string[] | null
          name?: string
          region?: string | null
          timezone?: string | null
          typology?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_orders: {
        Row: {
          created_at: string
          expected_delivery_date: string | null
          id: string
          product_id: string
          quantity_requested: number
          status: string
          supplier_name: string
        }
        Insert: {
          created_at?: string
          expected_delivery_date?: string | null
          id?: string
          product_id: string
          quantity_requested?: number
          status?: string
          supplier_name?: string
        }
        Update: {
          created_at?: string
          expected_delivery_date?: string | null
          id?: string
          product_id?: string
          quantity_requested?: number
          status?: string
          supplier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json
          provider: string | null
          provider_event_id: string | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json
          provider?: string | null
          provider_event_id?: string | null
          reason?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json
          provider?: string | null
          provider_event_id?: string | null
          reason?: string
        }
        Relationships: []
      }
      task_alerts: {
        Row: {
          alert_type: Database["public"]["Enums"]["task_alert_type"]
          certification_id: string
          created_at: string
          created_by: string
          description: string | null
          escalate_to_admin: boolean
          id: string
          is_resolved: boolean
          resolved_at: string | null
          scheduled_date: string | null
          title: string
        }
        Insert: {
          alert_type: Database["public"]["Enums"]["task_alert_type"]
          certification_id: string
          created_at?: string
          created_by: string
          description?: string | null
          escalate_to_admin?: boolean
          id?: string
          is_resolved?: boolean
          resolved_at?: string | null
          scheduled_date?: string | null
          title: string
        }
        Update: {
          alert_type?: Database["public"]["Enums"]["task_alert_type"]
          certification_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          escalate_to_admin?: boolean
          id?: string
          is_resolved?: boolean
          resolved_at?: string | null
          scheduled_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_alerts_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "certifications"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry: {
        Row: {
          device_id: string
          id: string
          labels: Json | null
          metric: string
          quality: string | null
          raw_payload: Json | null
          site_id: string | null
          ts: string
          unit: string | null
          value: number
        }
        Insert: {
          device_id: string
          id?: string
          labels?: Json | null
          metric: string
          quality?: string | null
          raw_payload?: Json | null
          site_id?: string | null
          ts?: string
          unit?: string | null
          value: number
        }
        Update: {
          device_id?: string
          id?: string
          labels?: Json | null
          metric?: string
          quality?: string | null
          raw_payload?: Json | null
          site_id?: string | null
          ts?: string
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_daily: {
        Row: {
          device_id: string
          id: string
          labels: Json | null
          metric: string
          sample_count: number | null
          site_id: string | null
          ts_day: string
          unit: string | null
          value_avg: number | null
          value_max: number | null
          value_min: number | null
          value_sum: number | null
        }
        Insert: {
          device_id: string
          id?: string
          labels?: Json | null
          metric: string
          sample_count?: number | null
          site_id?: string | null
          ts_day: string
          unit?: string | null
          value_avg?: number | null
          value_max?: number | null
          value_min?: number | null
          value_sum?: number | null
        }
        Update: {
          device_id?: string
          id?: string
          labels?: Json | null
          metric?: string
          sample_count?: number | null
          site_id?: string | null
          ts_day?: string
          unit?: string | null
          value_avg?: number | null
          value_max?: number | null
          value_min?: number | null
          value_sum?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_daily_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_hourly: {
        Row: {
          device_id: string
          id: string
          labels: Json | null
          metric: string
          sample_count: number | null
          site_id: string | null
          ts_hour: string
          unit: string | null
          value_avg: number | null
          value_max: number | null
          value_min: number | null
          value_sum: number | null
        }
        Insert: {
          device_id: string
          id?: string
          labels?: Json | null
          metric: string
          sample_count?: number | null
          site_id?: string | null
          ts_hour: string
          unit?: string | null
          value_avg?: number | null
          value_max?: number | null
          value_min?: number | null
          value_sum?: number | null
        }
        Update: {
          device_id?: string
          id?: string
          labels?: Json | null
          metric?: string
          sample_count?: number | null
          site_id?: string | null
          ts_hour?: string
          unit?: string | null
          value_avg?: number | null
          value_max?: number | null
          value_min?: number | null
          value_sum?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_hourly_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_hourly_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_latest: {
        Row: {
          device_id: string
          labels: Json | null
          metric: string
          quality: string | null
          site_id: string | null
          ts: string
          unit: string | null
          value: number
        }
        Insert: {
          device_id: string
          labels?: Json | null
          metric: string
          quality?: string | null
          site_id?: string | null
          ts: string
          unit?: string | null
          value: number
        }
        Update: {
          device_id?: string
          labels?: Json | null
          metric?: string
          quality?: string | null
          site_id?: string | null
          ts?: string
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_latest_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_latest_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      user_memberships: {
        Row: {
          allowed_regions: string[] | null
          brand_id: string | null
          created_at: string | null
          holding_id: string | null
          id: string
          permission: Database["public"]["Enums"]["permission_level"]
          role: string | null
          scope_id: string
          scope_type: Database["public"]["Enums"]["scope_type"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allowed_regions?: string[] | null
          brand_id?: string | null
          created_at?: string | null
          holding_id?: string | null
          id?: string
          permission?: Database["public"]["Enums"]["permission_level"]
          role?: string | null
          scope_id: string
          scope_type: Database["public"]["Enums"]["scope_type"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allowed_regions?: string[] | null
          brand_id?: string | null
          created_at?: string | null
          holding_id?: string | null
          id?: string
          permission?: Database["public"]["Enums"]["permission_level"]
          role?: string | null
          scope_id?: string
          scope_type?: Database["public"]["Enums"]["scope_type"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_memberships_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_memberships_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      water_leaks: {
        Row: {
          id: string
          leak_rate: number | null
          metadata: Json | null
          notes: string | null
          site_id: string
          status: string
          ts_detected: string
          ts_resolved: string | null
          zone_id: string
        }
        Insert: {
          id?: string
          leak_rate?: number | null
          metadata?: Json | null
          notes?: string | null
          site_id: string
          status?: string
          ts_detected?: string
          ts_resolved?: string | null
          zone_id: string
        }
        Update: {
          id?: string
          leak_rate?: number | null
          metadata?: Json | null
          notes?: string | null
          site_id?: string
          status?: string
          ts_detected?: string
          ts_resolved?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "water_leaks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "water_leaks_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "water_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      water_zones: {
        Row: {
          created_at: string | null
          flow_device_id: string | null
          id: string
          name: string
          site_id: string
          zone_type: string | null
        }
        Insert: {
          created_at?: string | null
          flow_device_id?: string | null
          id?: string
          name: string
          site_id: string
          zone_type?: string | null
        }
        Update: {
          created_at?: string | null
          flow_device_id?: string | null
          id?: string
          name?: string
          site_id?: string
          zone_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "water_zones_flow_device_id_fkey"
            columns: ["flow_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "water_zones_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_data: {
        Row: {
          created_at: string | null
          humidity_percent: number | null
          id: string
          pm10: number | null
          pm2_5: number | null
          site_id: string | null
          temperature_c: number | null
          timestamp: string
        }
        Insert: {
          created_at?: string | null
          humidity_percent?: number | null
          id?: string
          pm10?: number | null
          pm2_5?: number | null
          site_id?: string | null
          temperature_c?: number | null
          timestamp: string
        }
        Update: {
          created_at?: string | null
          humidity_percent?: number | null
          id?: string
          pm10?: number | null
          pm2_5?: number | null
          site_id?: string | null
          temperature_c?: number | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "weather_data_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      energy_phase_latest: {
        Row: {
          current_a: number | null
          device_id: string | null
          i1: number | null
          i2: number | null
          i3: number | null
          pf1: number | null
          pf2: number | null
          pf3: number | null
          site_id: string | null
          ts: string | null
          v1: number | null
          v2: number | null
          v3: number | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_power_computed: {
        Row: {
          current_a: number | null
          device_id: string | null
          i1: number | null
          i2: number | null
          i3: number | null
          phase_type: string | null
          power_source: string | null
          power_w: number | null
          site_id: string | null
          ts: string | null
          v1: number | null
          v2: number | null
          v3: number | null
          wiring_type: Database["public"]["Enums"]["wiring_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_site_daily_stitched: {
        Row: {
          computed_at: string | null
          day_local: string | null
          day_utc: string | null
          devices_count: number | null
          metric: string | null
          points: number | null
          site_id: string | null
          source: string | null
          unit: string | null
          value: number | null
        }
        Relationships: []
      }
      site_energy_daily: {
        Row: {
          metric: string | null
          sample_count: number | null
          site_id: string | null
          ts_day: string | null
          value_avg: number | null
          value_max: number | null
          value_min: number | null
          value_sum: number | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_energy_hourly: {
        Row: {
          metric: string | null
          sample_count: number | null
          site_id: string | null
          ts_hour: string | null
          value_avg: number | null
          value_max: number | null
          value_min: number | null
          value_sum: number | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_hourly_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      view_resource_saturation: {
        Row: {
          next_deadline: string | null
          total_active_tasks: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      aggregate_daily: { Args: { p_date?: string }; Returns: number }
      aggregate_energy_daily: {
        Args: { p_date?: string }
        Returns: {
          metrics_aggregated: number
          rows_inserted: number
          rows_processed: number
        }[]
      }
      aggregate_energy_hourly: {
        Args: { p_hour?: string }
        Returns: {
          metrics_aggregated: number
          rows_inserted: number
          rows_processed: number
        }[]
      }
      aggregate_hourly: { Args: { p_hour?: string }; Returns: number }
      aggregate_telemetry_daily: {
        Args: { p_date?: string }
        Returns: {
          metrics_aggregated: number
          rows_inserted: number
          rows_processed: number
        }[]
      }
      aggregate_telemetry_hourly: {
        Args: { p_hour?: string }
        Returns: {
          metrics_aggregated: number
          rows_inserted: number
          rows_processed: number
        }[]
      }
      apply_payment_scheme: {
        Args: { _cert_id: string; _scheme: string; _total: number }
        Returns: undefined
      }
      archive_resolved_alerts: {
        Args: { p_retention_days?: number }
        Returns: undefined
      }
      backfill_correlation_cache: {
        Args: { p_days?: number; p_site_id?: string }
        Returns: undefined
      }
      calculate_site_weather_correlation: {
        Args: { p_days?: number; p_site_id: string }
        Returns: number
      }
      can_access_brand: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_holding: {
        Args: { _holding_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_site: {
        Args: { _site_id: string; _user_id: string }
        Returns: boolean
      }
      check_device_health: { Args: never; Returns: undefined }
      compute_historical_power: {
        Args: { p_device_id: string; p_end: string; p_start: string }
        Returns: {
          phase_type: string
          power_source: string
          power_w: number
          ts: string
        }[]
      }
      compute_power_w:
        | {
            Args: {
              p_i1: number
              p_i2: number
              p_i3: number
              p_pf_default?: number
              p_pf1?: number
              p_pf2?: number
              p_pf3?: number
              p_v1: number
              p_v2: number
              p_v3: number
              p_vll_default?: number
              p_vln_default?: number
              p_wiring_type?: string
            }
            Returns: {
              calc_method: string
              power_source: string
              power_w: number
            }[]
          }
        | {
            Args: {
              p_i1: number
              p_i2: number
              p_i3: number
              p_pf_default?: number
              p_pf1?: number
              p_pf2?: number
              p_pf3?: number
              p_v1: number
              p_v2: number
              p_v3: number
              p_vll_default?: number
              p_vln_default?: number
              p_wiring_type?: Database["public"]["Enums"]["wiring_type"]
            }
            Returns: {
              calc_method: string
              power_source: string
              power_w: number
            }[]
          }
      compute_power_w_single: {
        Args: {
          p_current_a: number
          p_pf?: number
          p_pf_default?: number
          p_vln_default?: number
          p_voltage_v?: number
        }
        Returns: {
          power_source: string
          power_w: number
        }[]
      }
      delete_email: {
        Args: { msg_id: number; queue_name: string }
        Returns: boolean
      }
      delete_stale_energy_latest: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      evaluate_daily_alerts: { Args: never; Returns: undefined }
      evaluate_instant_alerts: { Args: never; Returns: undefined }
      evaluate_sensor_health: { Args: never; Returns: undefined }
      evaluate_sustained_alerts: { Args: never; Returns: undefined }
      extract_mqtt_timestamp: {
        Args: { p_fallback: string; p_payload: Json }
        Returns: string
      }
      generate_standard_leed_timeline: {
        Args: { p_certification_id: string }
        Returns: undefined
      }
      get_energy_weather_correlation_data: {
        Args: { p_end_date?: string; p_site_id: string; p_start_date?: string }
        Returns: {
          energy_kwh: number
          humidity_pct: number
          temp_c: number
          ts: string
        }[]
      }
      get_panel_config: {
        Args: { p_device_id: string; p_site_id: string }
        Returns: {
          pf_default: number
          use_measured_pf: boolean
          use_measured_voltage: boolean
          vll_default: number
          vln_default: number
          wiring_type: string
        }[]
      }
      get_site_energy_summary: {
        Args: { p_end: string; p_site_id: string; p_start: string }
        Returns: {
          avg_power_kw: number
          hvac_kwh: number
          lighting_kwh: number
          peak_power_kw: number
          plugs_kwh: number
          total_kwh: number
        }[]
      }
      get_telemetry_timeseries: {
        Args: {
          p_bucket?: string
          p_device_ids: string[]
          p_end: string
          p_metrics: string[]
          p_start: string
        }
        Returns: {
          device_id: string
          metric: string
          sample_count: number
          ts: string
          value: number
          value_max: number
          value_min: number
        }[]
      }
      get_time_bucket: {
        Args: { p_end: string; p_start: string }
        Returns: string
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_scope_access: {
        Args: {
          _required_permission?: Database["public"]["Enums"]["permission_level"]
          _scope_id: string
          _scope_type: Database["public"]["Enums"]["scope_type"]
          _user_id: string
        }
        Returns: boolean
      }
      infer_device_type_from_topic: {
        Args: { p_topic: string }
        Returns: Database["public"]["Enums"]["device_type"]
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_cert_pm: {
        Args: { p_certification_id: string; p_user_id: string }
        Returns: boolean
      }
      is_project_pm: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_valid_measurement: { Args: { val: number }; Returns: boolean }
      mark_stale_devices_offline: {
        Args: { p_threshold_minutes?: number }
        Returns: number
      }
      materialize_power_metrics: {
        Args: { p_since?: string }
        Returns: {
          records_created: number
        }[]
      }
      move_to_dlq: {
        Args: { msg_id: number; queue_name: string }
        Returns: boolean
      }
      normalize_device_id: { Args: { p_device_id: string }; Returns: string }
      purge_old_telemetry: {
        Args: {
          p_hourly_retention_days?: number
          p_mqtt_raw_retention_days?: number
          p_raw_retention_days?: number
        }
        Returns: {
          hourly_deleted: number
          mqtt_raw_deleted: number
          raw_deleted: number
        }[]
      }
      read_email_batch: {
        Args: {
          batch_size?: number
          queue_name: string
          visibility_timeout?: number
        }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      refresh_correlation_cache: { Args: never; Returns: undefined }
      refresh_weather_impact_insights: { Args: never; Returns: undefined }
      reprocess_failed_mqtt_messages: {
        Args: { p_limit?: number }
        Returns: {
          error_count: number
          processed_count: number
        }[]
      }
      reprocess_unprocessed_mqtt_messages: {
        Args: { p_limit?: number }
        Returns: {
          error_count: number
          processed_count: number
          telemetry_created: number
        }[]
      }
      reset_sensor_health_daily: { Args: never; Returns: undefined }
      run_daily_jobs: {
        Args: never
        Returns: {
          details: Json
          job_name: string
          status: string
        }[]
      }
      run_scheduled_jobs: {
        Args: never
        Returns: {
          details: Json
          job_name: string
          status: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_site_settings_to_rules: {
        Args: { p_site_id: string }
        Returns: undefined
      }
      sync_telemetry_to_energy: {
        Args: { p_since?: string }
        Returns: {
          derived_from_power: number
          direct_synced: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "viewer"
        | "editor"
        | "admin"
        | "superuser"
        | "ADMIN"
        | "PM"
        | "document_manager"
        | "specialist"
        | "energy_modeler"
        | "cxa"
      device_status: "online" | "offline" | "warning" | "error" | "maintenance"
      device_type:
        | "air_quality"
        | "energy_monitor"
        | "water_meter"
        | "occupancy"
        | "hvac"
        | "lighting"
        | "other"
      event_severity: "info" | "warning" | "critical"
      event_status: "active" | "acknowledged" | "resolved"
      hardware_fulfillment_status:
        | "Available"
        | "Allocated"
        | "In_Transit"
        | "Delivered"
      milestone_category: "scorecard" | "timeline"
      permission_level: "view" | "edit" | "admin"
      scope_type: "project" | "site" | "brand" | "holding" | "region"
      task_alert_type:
        | "timeline_to_configure"
        | "milestone_deadline"
        | "project_on_hold"
        | "pm_operational"
        | "other_critical"
        | "extra_canone"
      wiring_type: "WYE" | "DELTA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "viewer",
        "editor",
        "admin",
        "superuser",
        "ADMIN",
        "PM",
        "document_manager",
        "specialist",
        "energy_modeler",
        "cxa",
      ],
      device_status: ["online", "offline", "warning", "error", "maintenance"],
      device_type: [
        "air_quality",
        "energy_monitor",
        "water_meter",
        "occupancy",
        "hvac",
        "lighting",
        "other",
      ],
      event_severity: ["info", "warning", "critical"],
      event_status: ["active", "acknowledged", "resolved"],
      hardware_fulfillment_status: [
        "Available",
        "Allocated",
        "In_Transit",
        "Delivered",
      ],
      milestone_category: ["scorecard", "timeline"],
      permission_level: ["view", "edit", "admin"],
      scope_type: ["project", "site", "brand", "holding", "region"],
      task_alert_type: [
        "timeline_to_configure",
        "milestone_deadline",
        "project_on_hold",
        "pm_operational",
        "other_critical",
        "extra_canone",
      ],
      wiring_type: ["WYE", "DELTA"],
    },
  },
} as const
