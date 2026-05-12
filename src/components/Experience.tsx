import type { ResumeData } from '../data/types'

interface ExperienceProps {
  jobs: ResumeData['experience']
  presentLabel: string
}

export default function Experience({ jobs, presentLabel }: ExperienceProps) {
  return (
    <div className="experience">
      {jobs.map((job, idx) => {
        const period = job.period.includes('--')
          ? job.period
          : `${job.period} -- ${presentLabel}`

        return (
          <div key={idx} className="job-card">
            <div className="job-header">
              <span className="job-company">{job.company}</span>
              <span className="job-period">{period}</span>
            </div>
            <p className="job-title">
              {job.title} · {job.location}
            </p>
            {job.description && (
              <p className="job-description">{job.description}</p>
            )}
            <ul className="job-bullets">
              {job.bullets.map((bullet, bIdx) => (
                <li key={bIdx}>{bullet}</li>
              ))}
            </ul>
            <div className="job-tech">
              {job.tech.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
