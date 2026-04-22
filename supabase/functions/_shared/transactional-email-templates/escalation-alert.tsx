/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface EscalationAlertProps {
  alertTypeLabel?: string
  alertTitle?: string
  description?: string
  projectName?: string
  clientName?: string
  pmName?: string
  scheduledDate?: string
  ctaUrl?: string
}

const EscalationAlertEmail = ({
  alertTypeLabel = 'Escalation',
  alertTitle = 'New escalation',
  description,
  projectName,
  clientName,
  pmName,
  scheduledDate,
  ctaUrl = 'https://site-ignite-seed.lovable.app/admin-tasks',
}: EscalationAlertProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {alertTypeLabel}: {alertTitle}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={badgeSection}>
          <Text style={badge}>{alertTypeLabel}</Text>
        </Section>

        <Heading style={h1}>{alertTitle}</Heading>

        {description && <Text style={text}>{description}</Text>}

        <Section style={metaSection}>
          {projectName && (
            <Text style={metaRow}>
              <span style={metaLabel}>Project</span>
              <span style={metaValue}>{projectName}</span>
            </Text>
          )}
          {clientName && (
            <Text style={metaRow}>
              <span style={metaLabel}>Client</span>
              <span style={metaValue}>{clientName}</span>
            </Text>
          )}
          {pmName && (
            <Text style={metaRow}>
              <span style={metaLabel}>Raised by</span>
              <span style={metaValue}>{pmName}</span>
            </Text>
          )}
          {scheduledDate && (
            <Text style={metaRow}>
              <span style={metaLabel}>Scheduled</span>
              <span style={metaValue}>{scheduledDate}</span>
            </Text>
          )}
        </Section>

        <Section style={buttonContainer}>
          <Button href={ctaUrl} style={button}>
            Open in FGB Studio
          </Button>
        </Section>

        <Hr style={hr} />

        <Text style={footer}>
          You are receiving this because you have admin access to FGB Studio.
          You can disable these notifications in Settings → Notifications.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: EscalationAlertEmail,
  subject: (data: Record<string, any>) =>
    `[${data.alertTypeLabel ?? 'Escalation'}] ${data.alertTitle ?? 'New escalation'}`,
  displayName: 'Admin escalation alert',
  previewData: {
    alertTypeLabel: 'PM Operational',
    alertTitle: 'Cliente non risponde alla richiesta documenti',
    description:
      'Il cliente non ha fornito i documenti richiesti da oltre 10 giorni. Necessario intervento.',
    projectName: 'LEED v4 BD+C — Milano Tower',
    clientName: 'Acme Holding',
    pmName: 'Mario Rossi',
    scheduledDate: '2026-04-30',
    ctaUrl: 'https://site-ignite-seed.lovable.app/admin-tasks',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}

const container = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 24px',
}

const badgeSection = {
  marginBottom: '16px',
}

const badge = {
  display: 'inline-block',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  color: '#0a84ff',
  backgroundColor: '#eef5ff',
  padding: '4px 10px',
  borderRadius: '6px',
  margin: 0,
}

const h1 = {
  fontSize: '24px',
  fontWeight: 600,
  color: '#1d1d1f',
  margin: '0 0 16px',
  lineHeight: 1.3,
}

const text = {
  fontSize: '15px',
  color: '#3a3a3c',
  lineHeight: 1.6,
  margin: '0 0 24px',
}

const metaSection = {
  backgroundColor: '#f5f5f7',
  borderRadius: '10px',
  padding: '16px 18px',
  margin: '0 0 28px',
}

const metaRow = {
  fontSize: '14px',
  color: '#1d1d1f',
  margin: '4px 0',
  lineHeight: 1.5,
}

const metaLabel = {
  display: 'inline-block',
  width: '90px',
  color: '#86868b',
  fontWeight: 500,
}

const metaValue = {
  color: '#1d1d1f',
  fontWeight: 500,
}

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '0 0 32px',
}

const button = {
  backgroundColor: '#0a84ff',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 500,
  textDecoration: 'none',
  padding: '12px 24px',
  borderRadius: '8px',
  display: 'inline-block',
}

const hr = {
  borderColor: '#e5e5ea',
  margin: '24px 0',
}

const footer = {
  fontSize: '12px',
  color: '#86868b',
  lineHeight: 1.5,
  margin: 0,
}
