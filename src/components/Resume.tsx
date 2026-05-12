import type { ResumeData } from '../data/types'
import Header from './Header'
import Section from './Section'
import Skills from './Skills'
import Experience from './Experience'
import Education from './Education'
import Footer from './Footer'

interface ResumeProps {
  data: ResumeData
}

export default function Resume({ data }: ResumeProps) {
  return (
    <div className="resume">
      <Header data={data} />
      <Section title={data.labels.summary}>
        <p className="summary-text">{data.summary}</p>
      </Section>
      <Section title={data.labels.skills}>
        <Skills skills={data.skills} />
      </Section>
      <Section title={data.labels.experience}>
        <Experience jobs={data.experience} presentLabel={data.labels.present} />
      </Section>
      <Section title={data.labels.education}>
        <Education education={data.education} />
      </Section>
      <Footer />
    </div>
  )
}
