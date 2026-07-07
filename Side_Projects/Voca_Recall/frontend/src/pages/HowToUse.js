import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Database,
  Mail,
  Settings,
  Key,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';

const steps = [
  {
    id: 1,
    label: 'Notion Token',
    icon: Key,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    title: 'Generate a Notion Integration Token',
    summary: 'Create an integration in Notion and copy its secret token.',
    details: (
      <ol className="list-decimal list-inside space-y-2 text-gray-600">
        <li>
          Go to{' '}
          <a
            href="https://www.notion.so/my-integrations"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline"
          >
            notion.so/my-integrations
          </a>{' '}
          and click <strong>New integration</strong>.
        </li>
        <li>Give it a name (e.g. "Voca Recaller") and select your workspace.</li>
        <li>Click <strong>Submit</strong>, then copy the <strong>Internal Integration Secret</strong>.</li>
        <li>
          In Voca Recaller, go to{' '}
          <Link to="/settings/tokens" className="text-primary-600 hover:underline">
            Settings → Manage Tokens
          </Link>{' '}
          and paste the token there.
        </li>
      </ol>
    ),
  },
  {
    id: 2,
    label: 'Share Data Source',
    icon: Database,
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    title: 'Share a Notion Data Source with Your Integration',
    summary: 'Grant your integration access to the vocabulary data source you want to use.',
    details: (
      <ol className="list-decimal list-inside space-y-2 text-gray-600">
        <li>Open the Notion data source that contains your vocabulary.</li>
        <li>
          Click the <strong>•••</strong> menu at the top-right of the page, then choose{' '}
          <strong>Add connections</strong>.
        </li>
        <li>Search for and select the integration you created in Step 1.</li>
        <li>
          In Voca Recaller, go to{' '}
          <Link to="/databases" className="text-primary-600 hover:underline">
            Databases
          </Link>{' '}
          and add the data source by pasting its 32-character Data Source ID.
        </li>
      </ol>
    ),
  },
  {
    id: 3,
    label: 'Email Service',
    icon: Mail,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    title: 'Set Up an Email Service',
    summary: 'Configure when and how your daily vocabulary emails are sent.',
    details: (
      <ol className="list-decimal list-inside space-y-2 text-gray-600">
        <li>
          Navigate to{' '}
          <Link to="/services" className="text-primary-600 hover:underline">
            Services
          </Link>{' '}
          and click <strong>Add Service</strong>.
        </li>
        <li>Select the data source you added in Step 2.</li>
        <li>
          Choose the number of vocabulary words to include per email and set your preferred delivery
          time.
        </li>
        <li>Save the service — your daily emails will now be scheduled automatically.</li>
      </ol>
    ),
  },
  {
    id: 4,
    label: 'Customise Settings',
    icon: Settings,
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    title: 'Customise Your Settings',
    summary: 'Fine-tune your account preferences and notification options.',
    details: (
      <ol className="list-decimal list-inside space-y-2 text-gray-600">
        <li>
          Visit{' '}
          <Link to="/settings" className="text-primary-600 hover:underline">
            Settings
          </Link>{' '}
          to update your profile, change your password, or manage your email preferences.
        </li>
        <li>
          Use{' '}
          <Link to="/settings/tokens" className="text-primary-600 hover:underline">
            Manage Tokens
          </Link>{' '}
          to add, refresh, or remove Notion integration tokens at any time.
        </li>
        <li>Head to <strong>Email Logs</strong> to review your delivery history.</li>
      </ol>
    ),
  },
];

const StepCard = ({ step }) => {
  const [open, setOpen] = useState(false);
  const Icon = step.icon;

  return (
    <div className="card transition-shadow duration-200 hover:shadow-md">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left focus:outline-none"
        aria-expanded={open}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${step.iconBg}`}
            >
              <Icon className={`h-5 w-5 ${step.iconColor}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Step {step.id}
                </span>
              </div>
              <h3 className="text-base font-semibold text-gray-900 mt-0.5">{step.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{step.summary}</p>
            </div>
          </div>
          <div className="flex-shrink-0 mt-1">
            {open ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-gray-100 animate-fade-in">
          {step.details}
        </div>
      )}
    </div>
  );
};

const HowToUse = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center mb-4">
          <BookOpen className="h-8 w-8 text-primary-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">How to Use Voca Recaller</h1>
        <p className="mt-3 text-gray-500 max-w-xl mx-auto">
          Follow these four steps to start receiving daily vocabulary emails straight from your
          Notion data sources.
        </p>
      </div>

      {/* Progress overview */}
      <div className="flex items-center justify-center gap-2 mb-10 flex-wrap">
        {steps.map((step, idx) => (
          <React.Fragment key={step.id}>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-primary-400" />
              <span className="text-sm font-medium text-gray-600">{step.label}</span>
            </div>
            {idx < steps.length - 1 && (
              <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step cards */}
      <div className="space-y-4">
        {steps.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </div>

      {/* CTA */}
      <div className="mt-10 text-center">
        <p className="text-gray-500 mb-4">Ready to get started?</p>
        <Link to="/dashboard" className="btn-primary inline-flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
};

export default HowToUse;
