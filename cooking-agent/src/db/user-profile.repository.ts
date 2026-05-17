import { getDb } from './index'

export interface UserProfile {
  id: string
  allergies: string[]
  diet_type: string
  skill_level: 'beginner' | 'intermediate' | 'expert'
  disliked: string[]
  calorie_goal: number
  created_at: number
  updated_at: number
}

interface ProfileRow {
  id: string
  allergies: string
  diet_type: string
  skill_level: string
  disliked: string
  calorie_goal: number
  created_at: number
  updated_at: number
}

function rowToProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    allergies: JSON.parse(row.allergies || '[]'),
    diet_type: row.diet_type || '',
    skill_level: (row.skill_level || 'intermediate') as UserProfile['skill_level'],
    disliked: JSON.parse(row.disliked || '[]'),
    calorie_goal: row.calorie_goal || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export const userProfileRepo = {
  getOrCreate(id: string = 'default'): UserProfile {
    const db = getDb()
    const now = Date.now()

    let row = db.prepare('SELECT * FROM user_profiles WHERE id = ?').get(id) as ProfileRow | undefined

    if (!row) {
      db.prepare(
        'INSERT INTO user_profiles (id, allergies, diet_type, skill_level, disliked, calorie_goal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(id, '[]', '', 'intermediate', '[]', 0, now, now)

      row = db.prepare('SELECT * FROM user_profiles WHERE id = ?').get(id) as ProfileRow
    }

    return rowToProfile(row!)
  },

  update(
    id: string,
    updates: Partial<Pick<UserProfile, 'allergies' | 'diet_type' | 'skill_level' | 'disliked' | 'calorie_goal'>>,
  ): UserProfile {
    const db = getDb()
    const now = Date.now()
    const current = this.getOrCreate(id)

    const allergies = updates.allergies ?? current.allergies
    const diet_type = updates.diet_type ?? current.diet_type
    const skill_level = updates.skill_level ?? current.skill_level
    const disliked = updates.disliked ?? current.disliked
    const calorie_goal = updates.calorie_goal ?? current.calorie_goal

    db.prepare(
      `UPDATE user_profiles
       SET allergies = ?, diet_type = ?, skill_level = ?, disliked = ?, calorie_goal = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      JSON.stringify(allergies),
      diet_type,
      skill_level,
      JSON.stringify(disliked),
      calorie_goal,
      now,
      id,
    )

    return this.getOrCreate(id)
  },

  buildProfilePrompt(id: string = 'default'): string {
    const profile = this.getOrCreate(id)

    const parts: string[] = []

    if (profile.allergies.length > 0) {
      parts.push(`- 过敏食材：${profile.allergies.join('、')}`)
    }

    if (profile.diet_type) {
      parts.push(`- 膳食模式：${profile.diet_type}`)
    }

    if (profile.skill_level) {
      const levelMap: Record<string, string> = {
        beginner: '新手（需要详细步骤和基础技巧说明）',
        intermediate: '中级（有一定烹饪基础）',
        expert: '高手（可以给出专业级建议和复杂技法）',
      }
      parts.push(`- 烹饪水平：${levelMap[profile.skill_level] || profile.skill_level}`)
    }

    if (profile.disliked.length > 0) {
      parts.push(`- 不喜欢：${profile.disliked.join('、')}`)
    }

    if (profile.calorie_goal > 0) {
      parts.push(`- 每日热量目标：${profile.calorie_goal} 大卡`)
    }

    if (parts.length === 0) return ''

    return `\n## 用户偏好\n${parts.join('\n')}\n\n请根据以上用户偏好调整回答。避免推荐过敏和不喜欢的食材，根据烹饪水平调整说明详细程度，如有膳食模式要求请严格遵守。`
  },
}