export interface ResumeData {
  name: string
  tagline: string
  contact: {
    email: string
    linkedin: string
    location: string
  }
  summary: string
  skills: {
    category: string
    items: string[]
  }[]
  experience: {
    company: string
    location: string
    title: string
    period: string
    description?: string
    bullets: string[]
    tech: string[]
  }[]
  education: {
    school: string
    period: string
    degree: string
  }
  labels: {
    summary: string
    skills: string
    experience: string
    education: string
    present: string
    back: string
  }
}
