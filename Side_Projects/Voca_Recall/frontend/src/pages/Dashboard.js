import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import toast from 'react-hot-toast';
import { 
  BookOpen, 
  Database, 
  Mail, 
  Plus, 
  Calendar,
  Clock,
  HelpCircle,
  Play
} from 'lucide-react';
import WelcomeOverlay, { WELCOME_STORAGE_KEY } from '../components/WelcomeOverlay';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', emoji: '🌅' };
  if (hour < 17) return { text: 'Good afternoon', emoji: '☀️' };
  if (hour < 21) return { text: 'Good evening', emoji: '🌇' };
  return { text: 'Good night', emoji: '🌙' };
};

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTour, setShowTour] = useState(false);
  const greeting = getGreeting();
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Show the welcome tour automatically on first visit
  useEffect(() => {
    const seen = localStorage.getItem(WELCOME_STORAGE_KEY);
    if (!seen) {
      setShowTour(true);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/user/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      toast.error('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome tour overlay */}
      {showTour && <WelcomeOverlay onClose={() => setShowTour(false)} />}

      {/* Welcome Section */}
      <div className="mb-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary-500 uppercase tracking-widest mb-1">
              {today}
            </p>
            <h1 className="text-3xl font-bold text-gray-900">
              {greeting.emoji}{' '}
              <span className="bg-gradient-to-r from-primary-600 to-indigo-500 bg-clip-text text-transparent">
                {greeting.text}
              </span>
              {user?.first_name ? `, ${user.first_name}!` : '!'}
            </h1>
            <p className="mt-2 text-gray-500">
              Here's what's happening with your vocabulary learning.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <button
              onClick={() => setShowTour(true)}
              className="inline-flex items-center gap-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-lg transition-colors duration-200 focus:outline-none shadow-sm"
            >
              <Play className="h-4 w-4" />
              Take the Tour
            </button>
            <Link
              to="/how-to-use"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-4 py-2 rounded-lg transition-colors duration-200"
            >
              <HelpCircle className="h-4 w-4" />
              How to Use
            </Link>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Database className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Connected Data Sources</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats?.databases_count || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <Mail className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Emails Sent</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats?.emails_sent || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Last Email</p>
              <p className="text-sm font-semibold text-gray-900">
                {stats?.last_email_sent 
                  ? new Date(stats.last_email_sent).toLocaleDateString()
                  : 'Never'
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions - Hidden for now, may add useful functions later */}
      {/* <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          Add quick action items here in the future
        </div>
      </div> */}

      {/* Getting Started */}
      {(!stats?.databases_count || stats.databases_count === 0) && (
        <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <div className="text-center">
            <BookOpen className="mx-auto h-12 w-12 text-blue-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Get Started with Voca Recaller
            </h3>
            <p className="text-gray-600 mb-6">
              Connect your first Notion data source to start receiving daily vocabulary emails.
            </p>
            <Link
              to="/databases"
              className="btn-primary inline-flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Data Source
            </Link>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {stats?.last_email_sent && (
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
          <div className="flex items-center text-sm text-gray-600">
            <Calendar className="h-4 w-4 mr-2" />
            <span>
              Last email sent on {new Date(stats.last_email_sent).toLocaleDateString()} at{' '}
              {new Date(stats.last_email_sent).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard; 