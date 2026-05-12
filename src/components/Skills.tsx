import type { ResumeData } from '../data/types'

interface SkillsProps {
  skills: ResumeData['skills']
}

export default function Skills({ skills }: SkillsProps) {
  return (
    <div className="skills">
      {skills.map((group) => (
        <div key={group.category} className="skills-category">
          <span className="skills-category-name">{group.category}</span>
          <div className="skills-tags">
            {group.items.map((item) => (
              <span key={item} className="skill-tag">
                {item}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
