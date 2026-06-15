/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as adminUserEvent } from './admin-user-event.tsx'
import { template as employeeFormShared } from './employee-form-shared.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'admin-user-event': adminUserEvent,
  'employee-form-shared': employeeFormShared,
}
