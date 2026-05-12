import type { ResumeData } from '../data/types'

interface EducationProps {
  education: ResumeData['education']
}

export default function Education({ education }: EducationProps) {
  return (
    <div className="education">
      <div className="education-header">
        <span className="education-school">{education.school}</span>
        <span className="education-period">{education.period}</span>
      </div>
      <p className="education-degree">{education.degree}</p>
    </div>
  )
}
