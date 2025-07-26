export interface ShareItem {
  id: string
  title: string
  url: string
  content_type: string
  preview_url?: string
  created_at: string
  metadata: Record<string, any>
}

export interface Wall {
  id: string
  name: string
  item_count: number
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  session_id?: string
  created_at: string
}

export interface ShareFormData {
  title?: string
  text?: string
  url?: string
  files?: FileList
}

export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}