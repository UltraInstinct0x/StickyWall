'use client'

import { useState, useEffect } from 'react'
import { Loader2, Lightbulb, TrendingUp, Clock, Target, Brain, Star } from 'lucide-react'

interface ContentInsight {
  type: string
  title: string
  description: string
  confidence: number
}

interface ContentInsightData {
  insights: ContentInsight[]
  relevance_score: number
  learning_potential: number
  actionability: number
  time_investment: string
  recommended_action: string
  related_topics: string[]
  difficulty_level: string
}

interface ContentInsightsProps {
  content: {
    url?: string
    title?: string
    text?: string
    category?: string
    tags?: string[]
  }
  userContext?: {
    interests: string[]
    experience_level: string
    recent_categories: string[]
  }
  onInsightsGenerated?: (insights: ContentInsightData) => void
}

const timeInvestmentLabels = {
  quick_read: { label: 'Quick Read', icon: '⚡', color: 'text-green-400', time: '1-3 min' },
  medium_read: { label: 'Medium Read', icon: '📖', color: 'text-yellow-400', time: '5-10 min' },
  deep_dive: { label: 'Deep Dive', icon: '🔍', color: 'text-red-400', time: '15+ min' },
  unknown: { label: 'Unknown', icon: '❓', color: 'text-gray-400', time: 'Unknown' }
}

const actionLabels = {
  read_now: { label: 'Read Now', icon: '🚀', color: 'bg-green-600 hover:bg-green-700' },
  save_for_later: { label: 'Save for Later', icon: '📚', color: 'bg-blue-600 hover:bg-blue-700' },
  share: { label: 'Worth Sharing', icon: '💫', color: 'bg-purple-600 hover:bg-purple-700' },
  skip: { label: 'Skip', icon: '⏭️', color: 'bg-gray-600 hover:bg-gray-700' },
  review: { label: 'Review', icon: '👀', color: 'bg-yellow-600 hover:bg-yellow-700' }
}

const difficultyLevels = {
  beginner: { label: 'Beginner Friendly', color: 'text-green-400', icon: '🌱' },
  intermediate: { label: 'Intermediate', color: 'text-yellow-400', icon: '🌿' },
  advanced: { label: 'Advanced', color: 'text-red-400', icon: '🌳' },
  unknown: { label: 'Unknown', color: 'text-gray-400', icon: '❓' }
}

export function ContentInsights({ content, userContext, onInsightsGenerated }: ContentInsightsProps) {
  const [insights, setInsights] = useState<ContentInsightData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (content.url || content.text) {
      generateInsights()
    }
  }, [content])

  const generateInsights = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          user_context: userContext
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate insights')
      }

      const data = await response.json()
      setInsights(data)
      
      if (onInsightsGenerated) {
        onInsightsGenerated(data)
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate insights')
      console.error('Error generating insights:', err)
    } finally {
      setLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-400'
    if (score >= 0.6) return 'text-yellow-400'
    if (score >= 0.4) return 'text-orange-400'
    return 'text-red-400'
  }

  const getScoreWidth = (score: number) => {
    return `${Math.max(10, score * 100)}%`
  }

  if (loading) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Analyzing content with AI...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm text-red-300">
          <span>⚠️ {error}</span>
          <button 
            onClick={generateInsights}
            className="ml-auto text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!insights) {
    return null
  }

  const timeInvestment = timeInvestmentLabels[insights.time_investment as keyof typeof timeInvestmentLabels] || timeInvestmentLabels.unknown
  const recommendedAction = actionLabels[insights.recommended_action as keyof typeof actionLabels] || actionLabels.review
  const difficultyLevel = difficultyLevels[insights.difficulty_level as keyof typeof difficultyLevels] || difficultyLevels.unknown

  return (
    <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm rounded-lg border border-gray-700/50 overflow-hidden">
      {/* Header with Key Metrics */}
      <div className="p-4 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-white">AI Insights</h3>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            {expanded ? 'Hide' : 'Show'} Details
          </button>
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-lg font-bold text-purple-400">
              {Math.round(insights.relevance_score * 100)}%
            </div>
            <div className="text-xs text-gray-400">Relevance</div>
          </div>
          
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">
              {Math.round(insights.learning_potential * 100)}%
            </div>
            <div className="text-xs text-gray-400">Learning</div>
          </div>
          
          <div className="text-center">
            <div className="text-lg font-bold text-green-400">
              {Math.round(insights.actionability * 100)}%
            </div>
            <div className="text-xs text-gray-400">Actionable</div>
          </div>
          
          <div className="text-center">
            <div className={`text-lg font-bold ${timeInvestment.color}`}>
              {timeInvestment.icon}
            </div>
            <div className="text-xs text-gray-400">{timeInvestment.time}</div>
          </div>
        </div>

        {/* Recommended Action */}
        <div className="mt-4 flex justify-center">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white ${recommendedAction.color}`}>
            <span>{recommendedAction.icon}</span>
            <span>{recommendedAction.label}</span>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Detailed Scores */}
          <div className="space-y-3">
            <h4 className="font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Detailed Analysis
            </h4>
            
            {[
              { label: 'Relevance Score', value: insights.relevance_score, icon: Target },
              { label: 'Learning Potential', value: insights.learning_potential, icon: Lightbulb },
              { label: 'Actionability', value: insights.actionability, icon: Star }
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-300 w-32">{label}</span>
                <div className="flex-1 bg-gray-700 rounded-full h-2 relative overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      value >= 0.8 ? 'bg-green-500' :
                      value >= 0.6 ? 'bg-yellow-500' :
                      value >= 0.4 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: getScoreWidth(value) }}
                  />
                </div>
                <span className={`text-sm font-medium w-12 text-right ${getScoreColor(value)}`}>
                  {Math.round(value * 100)}%
                </span>
              </div>
            ))}
          </div>

          {/* Content Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h5 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Time & Difficulty
              </h5>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Reading Time:</span>
                  <span className={`${timeInvestment.color} font-medium`}>
                    {timeInvestment.icon} {timeInvestment.label}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Difficulty:</span>
                  <span className={`${difficultyLevel.color} font-medium`}>
                    {difficultyLevel.icon} {difficultyLevel.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Related Topics */}
            {insights.related_topics.length > 0 && (
              <div>
                <h5 className="text-sm font-semibold text-white mb-2">Related Topics</h5>
                <div className="flex flex-wrap gap-1">
                  {insights.related_topics.map((topic, index) => (
                    <span
                      key={index}
                      className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded-full"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* AI Insights */}
          {insights.insights.length > 0 && (
            <div>
              <h4 className="font-semibold text-white flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4" />
                Key Insights
              </h4>
              <div className="space-y-3">
                {insights.insights.map((insight, index) => (
                  <div key={index} className="bg-gray-700/50 rounded-lg p-3 border-l-4 border-purple-500">
                    <div className="flex justify-between items-start mb-1">
                      <h6 className="font-medium text-white text-sm">{insight.title}</h6>
                      <span className="text-xs text-gray-400">
                        {Math.round(insight.confidence * 100)}% confidence
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {insight.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ContentInsights