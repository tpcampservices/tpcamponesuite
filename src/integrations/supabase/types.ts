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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_entitlements: {
        Row: {
          access_expiry_date: string | null
          access_start_date: string | null
          access_status: string
          addons: Json
          admin_notes: string | null
          allowed_apps: Json | null
          billing_period: string | null
          created_at: string
          currency: string
          granted_at: string | null
          granted_by: string | null
          payment_status: string
          plan_id: string | null
          seats_extra: number
          seats_limit: number | null
          status: string
          subscription_source: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          access_expiry_date?: string | null
          access_start_date?: string | null
          access_status?: string
          addons?: Json
          admin_notes?: string | null
          allowed_apps?: Json | null
          billing_period?: string | null
          created_at?: string
          currency?: string
          granted_at?: string | null
          granted_by?: string | null
          payment_status?: string
          plan_id?: string | null
          seats_extra?: number
          seats_limit?: number | null
          status?: string
          subscription_source?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          access_expiry_date?: string | null
          access_start_date?: string | null
          access_status?: string
          addons?: Json
          admin_notes?: string | null
          allowed_apps?: Json | null
          billing_period?: string | null
          created_at?: string
          currency?: string
          granted_at?: string | null
          granted_by?: string | null
          payment_status?: string
          plan_id?: string | null
          seats_extra?: number
          seats_limit?: number | null
          status?: string
          subscription_source?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_entitlements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_access_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          details: Json
          id: string
          new_expiry_date: string | null
          new_payment_status: string | null
          new_plan_id: string | null
          new_status: string | null
          new_subscription_source: string | null
          old_expiry_date: string | null
          old_payment_status: string | null
          old_plan_id: string | null
          old_status: string | null
          old_subscription_source: string | null
          reason: string | null
          target_user_id: string | null
          target_workspace: string | null
        }
        Insert: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          new_expiry_date?: string | null
          new_payment_status?: string | null
          new_plan_id?: string | null
          new_status?: string | null
          new_subscription_source?: string | null
          old_expiry_date?: string | null
          old_payment_status?: string | null
          old_plan_id?: string | null
          old_status?: string | null
          old_subscription_source?: string | null
          reason?: string | null
          target_user_id?: string | null
          target_workspace?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          new_expiry_date?: string | null
          new_payment_status?: string | null
          new_plan_id?: string | null
          new_status?: string | null
          new_subscription_source?: string | null
          old_expiry_date?: string | null
          old_payment_status?: string | null
          old_plan_id?: string | null
          old_status?: string | null
          old_subscription_source?: string | null
          reason?: string | null
          target_user_id?: string | null
          target_workspace?: string | null
        }
        Relationships: []
      }
      business_profiles: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          default_currency: string
          governing_law: string
          id: string
          legal_name: string
          registration_number: string | null
          signatory_name: string | null
          signatory_title: string | null
          trading_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_currency?: string
          governing_law?: string
          id?: string
          legal_name: string
          registration_number?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          trading_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_currency?: string
          governing_law?: string
          id?: string
          legal_name?: string
          registration_number?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          trading_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          subject?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          counterparty: string | null
          created_at: string
          generated_at: string | null
          id: string
          status: string
          template_id: string
          template_title: string
          title: string
          updated_at: string
          user_id: string
          values: Json
        }
        Insert: {
          counterparty?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          status?: string
          template_id: string
          template_title: string
          title: string
          updated_at?: string
          user_id: string
          values?: Json
        }
        Update: {
          counterparty?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          status?: string
          template_id?: string
          template_title?: string
          title?: string
          updated_at?: string
          user_id?: string
          values?: Json
        }
        Relationships: []
      }
      crm_contacts: {
        Row: {
          created_at: string
          crm_provider: string
          external_contact_id: string | null
          id: string
          last_attempted_at: string | null
          last_error: string | null
          last_payload_hash: string | null
          last_synced_at: string | null
          normalized_email: string | null
          sync_attempts: number
          sync_status: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          crm_provider?: string
          external_contact_id?: string | null
          id?: string
          last_attempted_at?: string | null
          last_error?: string | null
          last_payload_hash?: string | null
          last_synced_at?: string | null
          normalized_email?: string | null
          sync_attempts?: number
          sync_status?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          crm_provider?: string
          external_contact_id?: string | null
          id?: string
          last_attempted_at?: string | null
          last_error?: string | null
          last_payload_hash?: string | null
          last_synced_at?: string | null
          normalized_email?: string | null
          sync_attempts?: number
          sync_status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sync_queue: {
        Row: {
          attempt_count: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          next_attempt_at: string
          note: string | null
          payload_hash: string | null
          processed_at: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          note?: string | null
          payload_hash?: string | null
          processed_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          note?: string | null
          payload_hash?: string | null
          processed_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      integration_settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      invitation_send_ledger: {
        Row: {
          actor_user_id: string
          created_at: string
          email_hash: string
          finalized_at: string | null
          id: string
          invitation_id: string | null
          kind: string
          status: string
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          email_hash: string
          finalized_at?: string | null
          id?: string
          invitation_id?: string | null
          kind: string
          status?: string
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          email_hash?: string
          finalized_at?: string | null
          id?: string
          invitation_id?: string | null
          kind?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_send_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      paypal_plans: {
        Row: {
          active: boolean
          amount: number | null
          created_at: string
          currency: string
          cycle: string
          label: string | null
          plan_id: string
          tier: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number | null
          created_at?: string
          currency?: string
          cycle: string
          label?: string | null
          plan_id: string
          tier: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number | null
          created_at?: string
          currency?: string
          cycle?: string
          label?: string | null
          plan_id?: string
          tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      paypal_webhook_diagnostics: {
        Row: {
          created_at: string
          environment: string | null
          event_id: string | null
          event_type: string | null
          headers_present: Json | null
          http_status: number | null
          id: string
          note: string | null
          outcome: string
          paypal_debug_id: string | null
          received_at: string
          rejection_reason: string | null
          signature_result: string | null
        }
        Insert: {
          created_at?: string
          environment?: string | null
          event_id?: string | null
          event_type?: string | null
          headers_present?: Json | null
          http_status?: number | null
          id?: string
          note?: string | null
          outcome?: string
          paypal_debug_id?: string | null
          received_at?: string
          rejection_reason?: string | null
          signature_result?: string | null
        }
        Update: {
          created_at?: string
          environment?: string | null
          event_id?: string | null
          event_type?: string | null
          headers_present?: Json | null
          http_status?: number | null
          id?: string
          note?: string | null
          outcome?: string
          paypal_debug_id?: string | null
          received_at?: string
          rejection_reason?: string | null
          signature_result?: string | null
        }
        Relationships: []
      }
      paypal_webhook_events: {
        Row: {
          applied: boolean
          created_at: string
          duplicate: boolean
          event_id: string
          event_type: string
          id: string
          new_status: string | null
          note: string | null
          payload: Json | null
          plan_id: string | null
          previous_status: string | null
          resource_id: string | null
          subscription_reference: string | null
          user_id: string | null
        }
        Insert: {
          applied?: boolean
          created_at?: string
          duplicate?: boolean
          event_id: string
          event_type: string
          id?: string
          new_status?: string | null
          note?: string | null
          payload?: Json | null
          plan_id?: string | null
          previous_status?: string | null
          resource_id?: string | null
          subscription_reference?: string | null
          user_id?: string | null
        }
        Update: {
          applied?: boolean
          created_at?: string
          duplicate?: boolean
          event_id?: string
          event_type?: string
          id?: string
          new_status?: string | null
          note?: string | null
          payload?: Json | null
          plan_id?: string | null
          previous_status?: string | null
          resource_id?: string | null
          subscription_reference?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      plan_limit_usage: {
        Row: {
          id: string
          metric: string
          period_key: string
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          id?: string
          metric: string
          period_key: string
          updated_at?: string
          used?: number
          user_id: string
        }
        Update: {
          id?: string
          metric?: string
          period_key?: string
          updated_at?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      plan_orders: {
        Row: {
          access_expiry_date: string | null
          access_start_date: string | null
          add_on_total: number
          addons: Json
          base_price: number
          billing_period: string
          capture_status: string | null
          captured_amount: number | null
          captured_at: string | null
          captured_currency: string | null
          created_at: string
          currency: string
          id: string
          last_error: string | null
          onboarding_fee: number
          organization_id: string | null
          paid_at: string | null
          payment_provider: string
          payment_status: string
          paypal_capture_id: string | null
          paypal_order_id: string | null
          plan_id: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          access_expiry_date?: string | null
          access_start_date?: string | null
          add_on_total?: number
          addons?: Json
          base_price?: number
          billing_period: string
          capture_status?: string | null
          captured_amount?: number | null
          captured_at?: string | null
          captured_currency?: string | null
          created_at?: string
          currency: string
          id?: string
          last_error?: string | null
          onboarding_fee?: number
          organization_id?: string | null
          paid_at?: string | null
          payment_provider?: string
          payment_status?: string
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          plan_id: string
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          access_expiry_date?: string | null
          access_start_date?: string | null
          add_on_total?: number
          addons?: Json
          base_price?: number
          billing_period?: string
          capture_status?: string | null
          captured_amount?: number | null
          captured_at?: string | null
          captured_currency?: string | null
          created_at?: string
          currency?: string
          id?: string
          last_error?: string | null
          onboarding_fee?: number
          organization_id?: string | null
          paid_at?: string | null
          payment_provider?: string
          payment_status?: string
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          plan_id?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          country: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          organisation: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          organisation?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          organisation?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      registration_affiliations: {
        Row: {
          created_at: string
          id: string
          party_id: string
          right_type: string
          society_code: string
          territory: string
          valid_from: string | null
          valid_to: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          party_id: string
          right_type: string
          society_code: string
          territory?: string
          valid_from?: string | null
          valid_to?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          party_id?: string
          right_type?: string
          society_code?: string
          territory?: string
          valid_from?: string | null
          valid_to?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_affiliations_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "registration_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_affiliations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_agreements: {
        Row: {
          agreement_type: string
          created_at: string
          end_date: string | null
          evidence_asset_id: string | null
          id: string
          party_ids: string[]
          rights: string[]
          start_date: string | null
          territory: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agreement_type: string
          created_at?: string
          end_date?: string | null
          evidence_asset_id?: string | null
          id?: string
          party_ids?: string[]
          rights?: string[]
          start_date?: string | null
          territory?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agreement_type?: string
          created_at?: string
          end_date?: string | null
          evidence_asset_id?: string | null
          id?: string
          party_ids?: string[]
          rights?: string[]
          start_date?: string | null
          territory?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_agreements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_assets: {
        Row: {
          asset_type: string
          bytes: number | null
          created_at: string
          created_by: string | null
          id: string
          mime_type: string | null
          registration_work_id: string | null
          sha256: string
          storage_path: string
          workspace_id: string
        }
        Insert: {
          asset_type: string
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          mime_type?: string | null
          registration_work_id?: string | null
          sha256: string
          storage_path: string
          workspace_id: string
        }
        Update: {
          asset_type?: string
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          mime_type?: string | null
          registration_work_id?: string | null
          sha256?: string
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_assets_registration_work_id_fkey"
            columns: ["registration_work_id"]
            isOneToOne: false
            referencedRelation: "registration_works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_authority: {
        Row: {
          created_at: string
          destination: string
          evidence_asset_id: string | null
          expires_at: string | null
          id: string
          scope: string | null
          signer_name: string | null
          signer_title: string | null
          submitting_party_id: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          destination: string
          evidence_asset_id?: string | null
          expires_at?: string | null
          id?: string
          scope?: string | null
          signer_name?: string | null
          signer_title?: string | null
          submitting_party_id?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          destination?: string
          evidence_asset_id?: string | null
          expires_at?: string | null
          id?: string
          scope?: string | null
          signer_name?: string | null
          signer_title?: string | null
          submitting_party_id?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_authority_submitting_party_id_fkey"
            columns: ["submitting_party_id"]
            isOneToOne: false
            referencedRelation: "registration_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_authority_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_conflicts: {
        Row: {
          conflict_type: string
          created_at: string
          field_path: string
          id: string
          proposed_value: Json | null
          registration_work_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_value: Json | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          conflict_type: string
          created_at?: string
          field_path: string
          id?: string
          proposed_value?: Json | null
          registration_work_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_value?: Json | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          conflict_type?: string
          created_at?: string
          field_path?: string
          id?: string
          proposed_value?: Json | null
          registration_work_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_value?: Json | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_conflicts_registration_work_id_fkey"
            columns: ["registration_work_id"]
            isOneToOne: false
            referencedRelation: "registration_works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_conflicts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_interests: {
        Row: {
          controlled: boolean | null
          created_at: string
          id: string
          mr_collection: number | null
          mr_ownership: number | null
          party_id: string
          pr_collection: number | null
          pr_ownership: number | null
          registration_work_id: string
          role_code: string
          source_snapshot_id: string | null
          sr_collection: number | null
          sr_ownership: number | null
          territory: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          controlled?: boolean | null
          created_at?: string
          id?: string
          mr_collection?: number | null
          mr_ownership?: number | null
          party_id: string
          pr_collection?: number | null
          pr_ownership?: number | null
          registration_work_id: string
          role_code: string
          source_snapshot_id?: string | null
          sr_collection?: number | null
          sr_ownership?: number | null
          territory?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          controlled?: boolean | null
          created_at?: string
          id?: string
          mr_collection?: number | null
          mr_ownership?: number | null
          party_id?: string
          pr_collection?: number | null
          pr_ownership?: number | null
          registration_work_id?: string
          role_code?: string
          source_snapshot_id?: string | null
          sr_collection?: number | null
          sr_ownership?: number | null
          territory?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_interests_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "registration_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_interests_registration_work_id_fkey"
            columns: ["registration_work_id"]
            isOneToOne: false
            referencedRelation: "registration_works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_interests_source_snapshot_id_fkey"
            columns: ["source_snapshot_id"]
            isOneToOne: false
            referencedRelation: "registration_source_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_interests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_packages: {
        Row: {
          adapter_version: string
          approved_at: string | null
          approved_by: string | null
          artifact_asset_id: string | null
          checksum: string
          created_at: string
          created_by: string | null
          destination: string
          id: string
          profile_id: string
          workspace_id: string
        }
        Insert: {
          adapter_version: string
          approved_at?: string | null
          approved_by?: string | null
          artifact_asset_id?: string | null
          checksum: string
          created_at?: string
          created_by?: string | null
          destination: string
          id?: string
          profile_id: string
          workspace_id: string
        }
        Update: {
          adapter_version?: string
          approved_at?: string | null
          approved_by?: string | null
          artifact_asset_id?: string | null
          checksum?: string
          created_at?: string
          created_by?: string | null
          destination?: string
          id?: string
          profile_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_packages_artifact_asset_id_fkey"
            columns: ["artifact_asset_id"]
            isOneToOne: false
            referencedRelation: "registration_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_packages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "registration_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_packages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_parties: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          legal_name: string
          party_type: string
          updated_at: string
          verified: boolean
          workspace_id: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          legal_name: string
          party_type: string
          updated_at?: string
          verified?: boolean
          workspace_id: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          legal_name?: string
          party_type?: string
          updated_at?: string
          verified?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_parties_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_party_identifiers: {
        Row: {
          created_at: string
          id: string
          party_id: string
          scheme: string
          source_app: string | null
          value: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          party_id: string
          scheme: string
          source_app?: string | null
          value: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          party_id?: string
          scheme?: string
          source_app?: string | null
          value?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_party_identifiers_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "registration_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_party_identifiers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_profiles: {
        Row: {
          catalog_revision: string | null
          catalog_snapshot_id: string | null
          created_at: string
          created_by: string | null
          fingerprint: string
          id: string
          ownership_revision: string | null
          profile_revision: number
          registration_work_id: string
          schema_version: string
          splits_snapshot_id: string | null
          urp: Json
          workspace_id: string
        }
        Insert: {
          catalog_revision?: string | null
          catalog_snapshot_id?: string | null
          created_at?: string
          created_by?: string | null
          fingerprint: string
          id?: string
          ownership_revision?: string | null
          profile_revision: number
          registration_work_id: string
          schema_version?: string
          splits_snapshot_id?: string | null
          urp: Json
          workspace_id: string
        }
        Update: {
          catalog_revision?: string | null
          catalog_snapshot_id?: string | null
          created_at?: string
          created_by?: string | null
          fingerprint?: string
          id?: string
          ownership_revision?: string | null
          profile_revision?: number
          registration_work_id?: string
          schema_version?: string
          splits_snapshot_id?: string | null
          urp?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_profiles_catalog_snapshot_id_fkey"
            columns: ["catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "registration_source_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_profiles_registration_work_id_fkey"
            columns: ["registration_work_id"]
            isOneToOne: false
            referencedRelation: "registration_works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_profiles_splits_snapshot_id_fkey"
            columns: ["splits_snapshot_id"]
            isOneToOne: false
            referencedRelation: "registration_source_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_receipts: {
        Row: {
          asset_id: string | null
          external_reference: string | null
          id: string
          outcome: string
          payload: Json | null
          receipt_kind: string
          received_at: string
          recorded_by: string | null
          submission_id: string
          workspace_id: string
        }
        Insert: {
          asset_id?: string | null
          external_reference?: string | null
          id?: string
          outcome: string
          payload?: Json | null
          receipt_kind: string
          received_at?: string
          recorded_by?: string | null
          submission_id: string
          workspace_id: string
        }
        Update: {
          asset_id?: string | null
          external_reference?: string | null
          id?: string
          outcome?: string
          payload?: Json | null
          receipt_kind?: string
          received_at?: string
          recorded_by?: string | null
          submission_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_receipts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "registration_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_receipts_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "registration_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_source_snapshots: {
        Row: {
          checksum: string
          entity_type: string
          id: string
          ownership_revision: string | null
          payload: Json
          received_at: string
          source_app: string
          source_entity_id: string
          source_event_id: string | null
          source_revision: string | null
          work_uid: string | null
          workspace_id: string
        }
        Insert: {
          checksum: string
          entity_type: string
          id?: string
          ownership_revision?: string | null
          payload: Json
          received_at?: string
          source_app: string
          source_entity_id: string
          source_event_id?: string | null
          source_revision?: string | null
          work_uid?: string | null
          workspace_id: string
        }
        Update: {
          checksum?: string
          entity_type?: string
          id?: string
          ownership_revision?: string | null
          payload?: Json
          received_at?: string
          source_app?: string
          source_entity_id?: string
          source_event_id?: string | null
          source_revision?: string | null
          work_uid?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_source_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_status_history: {
        Row: {
          actor_user_id: string | null
          created_at: string
          destination: string
          details: Json
          id: string
          note: string | null
          package_id: string | null
          profile_id: string | null
          registration_work_id: string
          state: string
          submission_id: string | null
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          destination?: string
          details?: Json
          id?: string
          note?: string | null
          package_id?: string | null
          profile_id?: string | null
          registration_work_id: string
          state: string
          submission_id?: string | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          destination?: string
          details?: Json
          id?: string
          note?: string | null
          package_id?: string | null
          profile_id?: string | null
          registration_work_id?: string
          state?: string
          submission_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_status_history_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "registration_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_status_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "registration_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_status_history_registration_work_id_fkey"
            columns: ["registration_work_id"]
            isOneToOne: false
            referencedRelation: "registration_works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_status_history_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "registration_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_status_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_submissions: {
        Row: {
          attempt_number: number
          channel: string
          external_reference: string | null
          id: string
          idempotency_key: string
          package_id: string
          response: Json | null
          submitted_at: string
          submitted_by: string | null
          workspace_id: string
        }
        Insert: {
          attempt_number: number
          channel: string
          external_reference?: string | null
          id?: string
          idempotency_key: string
          package_id: string
          response?: Json | null
          submitted_at?: string
          submitted_by?: string | null
          workspace_id: string
        }
        Update: {
          attempt_number?: number
          channel?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string
          package_id?: string
          response?: Json | null
          submitted_at?: string
          submitted_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_submissions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "registration_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_submissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_validations: {
        Row: {
          created_at: string
          destination: string
          id: string
          issues: Json
          passed: boolean
          profile_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          destination?: string
          id?: string
          issues?: Json
          passed: boolean
          profile_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          destination?: string
          id?: string
          issues?: Json
          passed?: boolean
          profile_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_validations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "registration_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_validations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_works: {
        Row: {
          catalog_work_id: string | null
          created_at: string
          created_by: string | null
          id: string
          primary_recording_id: string | null
          split_sheet_id: string | null
          status: string
          updated_at: string
          work_uid: string
          workspace_id: string
        }
        Insert: {
          catalog_work_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          primary_recording_id?: string | null
          split_sheet_id?: string | null
          status?: string
          updated_at?: string
          work_uid: string
          workspace_id: string
        }
        Update: {
          catalog_work_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          primary_recording_id?: string | null
          split_sheet_id?: string | null
          status?: string
          updated_at?: string
          work_uid?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_works_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_writeback_requests: {
        Row: {
          created_at: string
          expected_current_value: Json | null
          field_path: string
          id: string
          new_value: Json
          receipt_id: string | null
          registration_work_id: string
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_app: string
          target_entity_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expected_current_value?: Json | null
          field_path: string
          id?: string
          new_value: Json
          receipt_id?: string | null
          registration_work_id: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_app: string
          target_entity_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expected_current_value?: Json | null
          field_path?: string
          id?: string
          new_value?: Json
          receipt_id?: string | null
          registration_work_id?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_app?: string
          target_entity_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_writeback_requests_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "registration_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_writeback_requests_registration_work_id_fkey"
            columns: ["registration_work_id"]
            isOneToOne: false
            referencedRelation: "registration_works"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_writeback_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_tickets: {
        Row: {
          app_slug: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          app_slug: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          user_id: string
        }
        Update: {
          app_slug?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number | null
          created_at: string
          currency: string
          expires_at: string | null
          id: string
          payment_provider: string | null
          payment_reference: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          tier: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          payment_provider?: string | null
          payment_reference?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          tier: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          id?: string
          payment_provider?: string | null
          payment_reference?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          tier?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json
          id: string
          role_key: string | null
          target_email: string | null
          target_user_id: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          role_key?: string | null
          target_email?: string | null
          target_user_id?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          role_key?: string | null
          target_email?: string | null
          target_user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          display_name: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          metadata: Json
          resend_count: number
          role_id: string
          status: string
          token_hash: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          metadata?: Json
          resend_count?: number
          role_id: string
          status?: string
          token_hash: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          metadata?: Json
          resend_count?: number
          role_id?: string
          status?: string
          token_hash?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "workspace_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_member_app_access: {
        Row: {
          access_level: string
          app_key: string
          created_at: string
          id: string
          membership_id: string
          updated_at: string
        }
        Insert: {
          access_level?: string
          app_key: string
          created_at?: string
          id?: string
          membership_id: string
          updated_at?: string
        }
        Update: {
          access_level?: string
          app_key?: string
          created_at?: string
          id?: string
          membership_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_member_app_access_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "workspace_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_member_permission_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          effect: string
          id: string
          membership_id: string
          permission_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effect: string
          id?: string
          membership_id: string
          permission_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effect?: string
          id?: string
          membership_id?: string
          permission_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_member_permission_overrides_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "workspace_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_permission_overrides_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "workspace_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_member_permission_overrides_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_memberships: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          role_id: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role_id: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "workspace_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_permissions: {
        Row: {
          action_key: string
          app_key: string
          created_at: string
          description: string | null
          id: string
          permission_key: string
        }
        Insert: {
          action_key: string
          app_key: string
          created_at?: string
          description?: string | null
          id?: string
          permission_key: string
        }
        Update: {
          action_key?: string
          app_key?: string
          created_at?: string
          description?: string | null
          id?: string
          permission_key?: string
        }
        Relationships: []
      }
      workspace_role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "workspace_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "workspace_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_protected: boolean
          is_system: boolean
          name: string
          rank: number
          role_key: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_protected?: boolean
          is_system?: boolean
          name: string
          rank?: number
          role_key: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_protected?: boolean
          is_system?: boolean
          name?: string
          rank?: number
          role_key?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invitation: {
        Args: {
          _app_access: Json
          _email: string
          _token_hash: string
          _total_seats: number
          _user_id: string
        }
        Returns: Json
      }
      can_read_registrations: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      create_workspace_invitation: {
        Args: {
          _display_name: string
          _email: string
          _expires_at: string
          _invited_by: string
          _role_id: string
          _token_hash: string
          _total_seats: number
          _workspace_id: string
        }
        Returns: string
      }
      crm_claim_jobs: {
        Args: { _limit: number }
        Returns: {
          attempt_count: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          next_attempt_at: string
          note: string | null
          payload_hash: string | null
          processed_at: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "crm_sync_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      crm_enqueue: {
        Args: { _event: string; _force?: boolean; _user_id: string }
        Returns: undefined
      }
      crm_enqueue_expired: { Args: never; Returns: number }
      crm_wake_processor: { Args: never; Returns: undefined }
      finalize_invitation_send: {
        Args: { _id: string; _ok: boolean }
        Returns: undefined
      }
      get_workspace_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tier_access: {
        Args: { _tier: number; _user_id: string }
        Returns: boolean
      }
      has_workspace_permission: {
        Args: {
          _permission_key: string
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      is_active_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      provision_user_workspace: { Args: { _user_id: string }; Returns: string }
      purge_invitation_send_ledger: { Args: never; Returns: number }
      reserve_invitation_send: {
        Args: {
          _actor_user_id: string
          _email_hash: string
          _invitation_id: string
          _kind: string
          _workspace_id: string
        }
        Returns: string
      }
      write_member_permission_override: {
        Args: {
          _actor_user_id: string
          _app_key: string
          _effect: string
          _membership_id: string
          _permission_id: string
          _permission_key: string
          _role_key: string
          _target_email: string
          _target_user_id: string
          _workspace_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "member"
      subscription_status: "pending" | "active" | "cancelled" | "expired"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["super_admin", "admin", "member"],
      subscription_status: ["pending", "active", "cancelled", "expired"],
    },
  },
} as const
