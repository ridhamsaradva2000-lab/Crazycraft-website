export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["admin_role"]
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["admin_role"]
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["admin_role"]
        }
        Relationships: []
      }
      attribution_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          landing_page: string | null
          page_path: string | null
          referrer: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          landing_page?: string | null
          page_path?: string | null
          referrer?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          landing_page?: string | null
          page_path?: string | null
          referrer?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_id: string | null
          content: string
          cover_image: string | null
          created_at: string
          id: string
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["blog_status"]
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          content: string
          cover_image?: string | null
          created_at?: string
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["blog_status"]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          content?: string
          cover_image?: string | null
          created_at?: string
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["blog_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      buyers: {
        Row: {
          business_type: Database["public"]["Enums"]["business_type"]
          company_name: string
          country: string
          created_at: string
          id: string
          phone: string | null
          verified: boolean
          website: string | null
        }
        Insert: {
          business_type: Database["public"]["Enums"]["business_type"]
          company_name: string
          country: string
          created_at?: string
          id: string
          phone?: string | null
          verified?: boolean
          website?: string | null
        }
        Update: {
          business_type?: Database["public"]["Enums"]["business_type"]
          company_name?: string
          country?: string
          created_at?: string
          id?: string
          phone?: string | null
          verified?: boolean
          website?: string | null
        }
        Relationships: []
      }
      capi_event_log: {
        Row: {
          capi_event_id: string
          created_at: string
          id: string
          response_body: Json | null
          response_status: number | null
        }
        Insert: {
          capi_event_id: string
          created_at?: string
          id?: string
          response_body?: Json | null
          response_status?: number | null
        }
        Update: {
          capi_event_id?: string
          created_at?: string
          id?: string
          response_body?: Json | null
          response_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "capi_event_log_capi_event_id_fkey"
            columns: ["capi_event_id"]
            isOneToOne: false
            referencedRelation: "capi_events"
            referencedColumns: ["id"]
          },
        ]
      }
      capi_events: {
        Row: {
          attempts: number
          created_at: string
          event_id: string
          event_name: string
          id: string
          inquiry_id: string | null
          last_error: string | null
          payload: Json
          quote_request_id: string | null
          sample_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["capi_event_status"]
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_id: string
          event_name: string
          id?: string
          inquiry_id?: string | null
          last_error?: string | null
          payload: Json
          quote_request_id?: string | null
          sample_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["capi_event_status"]
        }
        Update: {
          attempts?: number
          created_at?: string
          event_id?: string
          event_name?: string
          id?: string
          inquiry_id?: string | null
          last_error?: string | null
          payload?: Json
          quote_request_id?: string | null
          sample_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["capi_event_status"]
        }
        Relationships: [
          {
            foreignKeyName: "capi_events_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capi_events_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "buyer_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capi_events_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capi_events_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "buyer_samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capi_events_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          parent_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          parent_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          assigned_to: string | null
          business_type: Database["public"]["Enums"]["business_type"]
          company_name: string | null
          company_website: string | null
          country: string
          created_at: string
          email: string
          email_normalized: string | null
          event_id: string | null
          fbc: string | null
          fbp: string | null
          first_touch_campaign: string | null
          first_touch_medium: string | null
          first_touch_source: string | null
          follow_up_at: string | null
          id: string
          incoterm_preference: Database["public"]["Enums"]["incoterm"] | null
          inquiry_type: Database["public"]["Enums"]["inquiry_type"]
          landing_page: string | null
          last_touch_campaign: string | null
          last_touch_medium: string | null
          last_touch_source: string | null
          lead_score: number
          linkedin_url: string | null
          message: string | null
          moq_familiarity: Database["public"]["Enums"]["moq_familiarity"] | null
          name: string
          private_label_required: boolean | null
          product_id: string | null
          qualification_stage: number
          referrer: string | null
          shipping_country: string | null
          status: Database["public"]["Enums"]["lead_status"]
          timeline: Database["public"]["Enums"]["purchase_timeline"] | null
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string | null
          volume_range: string | null
        }
        Insert: {
          assigned_to?: string | null
          business_type: Database["public"]["Enums"]["business_type"]
          company_name?: string | null
          company_website?: string | null
          country: string
          created_at?: string
          email: string
          email_normalized?: string | null
          event_id?: string | null
          fbc?: string | null
          fbp?: string | null
          first_touch_campaign?: string | null
          first_touch_medium?: string | null
          first_touch_source?: string | null
          follow_up_at?: string | null
          id?: string
          incoterm_preference?: Database["public"]["Enums"]["incoterm"] | null
          inquiry_type?: Database["public"]["Enums"]["inquiry_type"]
          landing_page?: string | null
          last_touch_campaign?: string | null
          last_touch_medium?: string | null
          last_touch_source?: string | null
          lead_score?: number
          linkedin_url?: string | null
          message?: string | null
          moq_familiarity?:
            | Database["public"]["Enums"]["moq_familiarity"]
            | null
          name: string
          private_label_required?: boolean | null
          product_id?: string | null
          qualification_stage?: number
          referrer?: string | null
          shipping_country?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          timeline?: Database["public"]["Enums"]["purchase_timeline"] | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
          volume_range?: string | null
        }
        Update: {
          assigned_to?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          company_name?: string | null
          company_website?: string | null
          country?: string
          created_at?: string
          email?: string
          email_normalized?: string | null
          event_id?: string | null
          fbc?: string | null
          fbp?: string | null
          first_touch_campaign?: string | null
          first_touch_medium?: string | null
          first_touch_source?: string | null
          follow_up_at?: string | null
          id?: string
          incoterm_preference?: Database["public"]["Enums"]["incoterm"] | null
          inquiry_type?: Database["public"]["Enums"]["inquiry_type"]
          landing_page?: string | null
          last_touch_campaign?: string | null
          last_touch_medium?: string | null
          last_touch_source?: string | null
          lead_score?: number
          linkedin_url?: string | null
          message?: string | null
          moq_familiarity?:
            | Database["public"]["Enums"]["moq_familiarity"]
            | null
          name?: string
          private_label_required?: boolean | null
          product_id?: string | null
          qualification_stage?: number
          referrer?: string | null
          shipping_country?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          timeline?: Database["public"]["Enums"]["purchase_timeline"] | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
          volume_range?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_rate_limit_log: {
        Row: {
          client_ip: unknown
          created_at: string
          id: string
          visitor_id: string | null
        }
        Insert: {
          client_ip?: unknown
          created_at?: string
          id?: string
          visitor_id?: string | null
        }
        Update: {
          client_ip?: unknown
          created_at?: string
          id?: string
          visitor_id?: string | null
        }
        Relationships: []
      }
      lead_activity_log: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          inquiry_id: string | null
          note: string | null
          quote_request_id: string | null
          sample_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          inquiry_id?: string | null
          note?: string | null
          quote_request_id?: string | null
          sample_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          inquiry_id?: string | null
          note?: string | null
          quote_request_id?: string | null
          sample_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activity_log_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activity_log_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "buyer_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activity_log_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activity_log_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "buyer_samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activity_log_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scoring_rules: {
        Row: {
          description: string
          factor_key: string
          id: string
          points: number
          updated_at: string
        }
        Insert: {
          description: string
          factor_key: string
          id?: string
          points: number
          updated_at?: string
        }
        Update: {
          description?: string
          factor_key?: string
          id?: string
          points?: number
          updated_at?: string
        }
        Relationships: []
      }
      media_library: {
        Row: {
          alt_text: string | null
          created_at: string
          filename: string
          id: string
          tags: string[]
          uploaded_by: string | null
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          filename: string
          id?: string
          tags?: string[]
          uploaded_by?: string | null
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          filename?: string
          id?: string
          tags?: string[]
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_library_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          email: string
          email_normalized: string | null
          id: string
          source: string | null
          subscribed_at: string
        }
        Insert: {
          email: string
          email_normalized?: string | null
          id?: string
          source?: string | null
          subscribed_at?: string
        }
        Update: {
          email?: string
          email_normalized?: string | null
          id?: string
          source?: string | null
          subscribed_at?: string
        }
        Relationships: []
      }
      product_collections: {
        Row: {
          collection_id: string
          product_id: string
        }
        Insert: {
          collection_id: string
          product_id: string
        }
        Update: {
          collection_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          updated_at: string
          url: string
        }
        Insert: {
          alt_text: string
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          updated_at?: string
          url: string
        }
        Update: {
          alt_text?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          price_note: string | null
          product_id: string
          sku: string | null
          sku_normalized: string | null
          updated_at: string
          variant_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          price_note?: string | null
          product_id: string
          sku?: string | null
          sku_normalized?: string | null
          updated_at?: string
          variant_name: string
        }
        Update: {
          created_at?: string
          id?: string
          price_note?: string | null
          product_id?: string
          sku?: string | null
          sku_normalized?: string | null
          updated_at?: string
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_material: string | null
          category_id: string | null
          created_at: string
          customization_notes: string | null
          description: string | null
          dimensions: string | null
          hs_code: string | null
          id: string
          is_customizable: boolean
          lead_time_days: number | null
          meta_description: string | null
          meta_title: string | null
          moq: number
          name: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          base_material?: string | null
          category_id?: string | null
          created_at?: string
          customization_notes?: string | null
          description?: string | null
          dimensions?: string | null
          hs_code?: string | null
          id?: string
          is_customizable?: boolean
          lead_time_days?: number | null
          meta_description?: string | null
          meta_title?: string | null
          moq?: number
          name: string
          short_description?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          base_material?: string | null
          category_id?: string | null
          created_at?: string
          customization_notes?: string | null
          description?: string | null
          dimensions?: string | null
          hs_code?: string | null
          id?: string
          is_customizable?: boolean
          lead_time_days?: number | null
          meta_description?: string | null
          meta_title?: string | null
          moq?: number
          name?: string
          short_description?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_request_items: {
        Row: {
          created_at: string
          customization_notes: string | null
          id: string
          product_id: string
          product_variant_id: string | null
          quantity: number
          quote_request_id: string
        }
        Insert: {
          created_at?: string
          customization_notes?: string | null
          id?: string
          product_id: string
          product_variant_id?: string | null
          quantity: number
          quote_request_id: string
        }
        Update: {
          created_at?: string
          customization_notes?: string | null
          id?: string
          product_id?: string
          product_variant_id?: string | null
          quantity?: number
          quote_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_quote_request_items_variant_matches_product"
            columns: ["product_variant_id", "product_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "product_id"]
          },
          {
            foreignKeyName: "quote_request_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_request_items_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "buyer_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_request_items_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          assigned_to: string | null
          buyer_id: string | null
          company_name: string | null
          country: string | null
          created_at: string
          email: string
          email_normalized: string | null
          event_id: string | null
          fbc: string | null
          fbp: string | null
          first_touch_medium: string | null
          first_touch_source: string | null
          follow_up_at: string | null
          id: string
          last_touch_medium: string | null
          last_touch_source: string | null
          lead_score: number
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          buyer_id?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          email: string
          email_normalized?: string | null
          event_id?: string | null
          fbc?: string | null
          fbp?: string | null
          first_touch_medium?: string | null
          first_touch_source?: string | null
          follow_up_at?: string | null
          id?: string
          last_touch_medium?: string | null
          last_touch_source?: string | null
          lead_score?: number
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          buyer_id?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          email?: string
          email_normalized?: string | null
          event_id?: string | null
          fbc?: string | null
          fbp?: string | null
          first_touch_medium?: string | null
          first_touch_source?: string | null
          follow_up_at?: string | null
          id?: string
          last_touch_medium?: string | null
          last_touch_source?: string | null
          lead_score?: number
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      samples: {
        Row: {
          assigned_to: string | null
          buyer_id: string | null
          company_name: string | null
          country: string
          courier_name: string | null
          created_at: string
          currency: string
          email: string
          email_normalized: string | null
          id: string
          inquiry_id: string | null
          name: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string | null
          product_id: string
          quote_request_id: string | null
          requested_quantity: number
          sample_charge: number
          sample_status: Database["public"]["Enums"]["sample_status"]
          shipping_address: string | null
          shipping_country: string | null
          shipping_port: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          buyer_id?: string | null
          company_name?: string | null
          country: string
          courier_name?: string | null
          created_at?: string
          currency?: string
          email: string
          email_normalized?: string | null
          id?: string
          inquiry_id?: string | null
          name: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          product_id: string
          quote_request_id?: string | null
          requested_quantity?: number
          sample_charge?: number
          sample_status?: Database["public"]["Enums"]["sample_status"]
          shipping_address?: string | null
          shipping_country?: string | null
          shipping_port?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          buyer_id?: string | null
          company_name?: string | null
          country?: string
          courier_name?: string | null
          created_at?: string
          currency?: string
          email?: string
          email_normalized?: string | null
          id?: string
          inquiry_id?: string | null
          name?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string | null
          product_id?: string
          quote_request_id?: string | null
          requested_quantity?: number
          sample_charge?: number
          sample_status?: Database["public"]["Enums"]["sample_status"]
          shipping_address?: string | null
          shipping_country?: string | null
          shipping_port?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "samples_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "buyer_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_products: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_products_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_metadata: {
        Row: {
          canonical_url: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          og_image: string | null
          page_path: string
        }
        Insert: {
          canonical_url?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          og_image?: string | null
          page_path: string
        }
        Update: {
          canonical_url?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          og_image?: string | null
          page_path?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      target_market_countries: {
        Row: {
          country: string
          created_at: string
        }
        Insert: {
          country: string
          created_at?: string
        }
        Update: {
          country?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_lead_overview: {
        Row: {
          assigned_to: string | null
          business_type: string | null
          company_name: string | null
          country: string | null
          created_at: string | null
          detail_type: string | null
          email: string | null
          follow_up_at: string | null
          id: string | null
          lead_score: number | null
          name: string | null
          qualification_stage: number | null
          source_type: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
          updated_at: string | null
        }
        Relationships: []
      }
      buyer_quote_requests: {
        Row: {
          buyer_id: string | null
          company_name: string | null
          country: string | null
          created_at: string | null
          email: string | null
          id: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          buyer_id?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          buyer_id?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_samples: {
        Row: {
          buyer_id: string | null
          company_name: string | null
          country: string | null
          courier_name: string | null
          created_at: string | null
          currency: string | null
          email: string | null
          id: string | null
          name: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          phone: string | null
          product_id: string | null
          quote_request_id: string | null
          requested_quantity: number | null
          sample_charge: number | null
          sample_status: Database["public"]["Enums"]["sample_status"] | null
          shipping_address: string | null
          shipping_country: string | null
          shipping_port: string | null
          tracking_number: string | null
          updated_at: string | null
        }
        Insert: {
          buyer_id?: string | null
          company_name?: string | null
          country?: string | null
          courier_name?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          phone?: string | null
          product_id?: string | null
          quote_request_id?: string | null
          requested_quantity?: number | null
          sample_charge?: number | null
          sample_status?: Database["public"]["Enums"]["sample_status"] | null
          shipping_address?: string | null
          shipping_country?: string | null
          shipping_port?: string | null
          tracking_number?: string | null
          updated_at?: string | null
        }
        Update: {
          buyer_id?: string | null
          company_name?: string | null
          country?: string | null
          courier_name?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          phone?: string | null
          product_id?: string | null
          quote_request_id?: string | null
          requested_quantity?: number | null
          sample_charge?: number | null
          sample_status?: Database["public"]["Enums"]["sample_status"] | null
          shipping_address?: string | null
          shipping_country?: string | null
          shipping_port?: string | null
          tracking_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "samples_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "buyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "buyer_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_update_inquiry: {
        Args: {
          p_assigned_to: string
          p_follow_up_at: string
          p_inquiry_id: string
          p_lead_score: number
          p_status: Database["public"]["Enums"]["lead_status"]
        }
        Returns: undefined
      }
      admin_update_quote_request: {
        Args: {
          p_assigned_to: string
          p_follow_up_at: string
          p_lead_score: number
          p_notes: string
          p_quote_request_id: string
          p_status: Database["public"]["Enums"]["lead_status"]
        }
        Returns: undefined
      }
      admin_update_sample_status: {
        Args: {
          p_assigned_to: string
          p_courier_name: string
          p_currency: string
          p_payment_status: Database["public"]["Enums"]["payment_status"]
          p_sample_charge: number
          p_sample_id: string
          p_sample_status: Database["public"]["Enums"]["sample_status"]
          p_shipping_address: string
          p_shipping_country: string
          p_shipping_port: string
          p_tracking_number: string
        }
        Returns: undefined
      }
      admin_verify_buyer: {
        Args: { p_buyer_id: string; p_verified: boolean }
        Returns: undefined
      }
      list_crm_assignment_admins: {
        Args: never
        Returns: {
          full_name: string
          id: string
          role: Database["public"]["Enums"]["admin_role"]
        }[]
      }
      search_samples: {
        Args: { p_search?: string }
        Returns: {
          assigned_to: string | null
          buyer_id: string | null
          company_name: string | null
          country: string
          courier_name: string | null
          created_at: string
          currency: string
          email: string
          email_normalized: string | null
          id: string
          inquiry_id: string | null
          name: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string | null
          product_id: string
          quote_request_id: string | null
          requested_quantity: number
          sample_charge: number
          sample_status: Database["public"]["Enums"]["sample_status"]
          shipping_address: string | null
          shipping_country: string | null
          shipping_port: string | null
          tracking_number: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "samples"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      submit_inquiry: {
        Args: {
          p_business_type: Database["public"]["Enums"]["business_type"]
          p_client_ip: unknown
          p_company_name: string
          p_company_website: string
          p_country: string
          p_email: string
          p_event_id: string
          p_fbc: string
          p_fbp: string
          p_first_touch_campaign: string
          p_first_touch_medium: string
          p_first_touch_source: string
          p_honeypot: string
          p_incoterm_preference: Database["public"]["Enums"]["incoterm"]
          p_landing_page: string
          p_last_touch_campaign: string
          p_last_touch_medium: string
          p_last_touch_source: string
          p_linkedin_url: string
          p_message: string
          p_moq_familiarity: Database["public"]["Enums"]["moq_familiarity"]
          p_name: string
          p_private_label_required: boolean
          p_product_id: string
          p_referrer: string
          p_shipping_country: string
          p_timeline: Database["public"]["Enums"]["purchase_timeline"]
          p_utm_campaign: string
          p_utm_medium: string
          p_utm_source: string
          p_visitor_id: string
          p_volume_range: string
          p_wants_sample: boolean
        }
        Returns: Json
      }
      submit_quote_request: {
        Args: {
          p_company_name: string
          p_country: string
          p_email: string
          p_event_id: string
          p_fbc: string
          p_fbp: string
          p_first_touch_medium: string
          p_first_touch_source: string
          p_items: Json
          p_last_touch_medium: string
          p_last_touch_source: string
          p_phone: string
          p_utm_campaign: string
          p_utm_medium: string
          p_utm_source: string
          p_visitor_id: string
        }
        Returns: string
      }
      submit_sample_request: {
        Args: {
          p_company_name: string
          p_country: string
          p_email: string
          p_name: string
          p_phone: string
          p_product_id: string
          p_quote_request_id: string
          p_requested_quantity: number
        }
        Returns: string
      }
    }
    Enums: {
      admin_role: "super_admin" | "editor" | "sales"
      blog_status: "draft" | "scheduled" | "published"
      business_type:
        | "importer"
        | "wholesaler"
        | "distributor"
        | "retail_chain"
        | "interior_designer"
        | "hotel_buyer"
        | "gift_chain"
        | "museum_store"
        | "oem_private_label"
        | "other"
      capi_event_status: "pending" | "sent" | "failed"
      incoterm: "fob" | "cif" | "exw" | "other"
      inquiry_type: "product" | "general" | "sample" | "partnership" | "quote"
      lead_status: "new" | "contacted" | "quoted" | "nurturing" | "won" | "lost"
      moq_familiarity: "first_time_importer" | "regular_importer"
      payment_status: "unpaid" | "paid" | "waived" | "refunded"
      product_status: "draft" | "published" | "archived"
      purchase_timeline:
        | "immediate"
        | "one_to_three_months"
        | "just_researching"
      sample_status:
        | "requested"
        | "approved"
        | "payment_pending"
        | "paid"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_role: ["super_admin", "editor", "sales"],
      blog_status: ["draft", "scheduled", "published"],
      business_type: [
        "importer",
        "wholesaler",
        "distributor",
        "retail_chain",
        "interior_designer",
        "hotel_buyer",
        "gift_chain",
        "museum_store",
        "oem_private_label",
        "other",
      ],
      capi_event_status: ["pending", "sent", "failed"],
      incoterm: ["fob", "cif", "exw", "other"],
      inquiry_type: ["product", "general", "sample", "partnership", "quote"],
      lead_status: ["new", "contacted", "quoted", "nurturing", "won", "lost"],
      moq_familiarity: ["first_time_importer", "regular_importer"],
      payment_status: ["unpaid", "paid", "waived", "refunded"],
      product_status: ["draft", "published", "archived"],
      purchase_timeline: [
        "immediate",
        "one_to_three_months",
        "just_researching",
      ],
      sample_status: [
        "requested",
        "approved",
        "payment_pending",
        "paid",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const
