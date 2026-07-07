import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import apiService from '../utils/apiService';
import toast from 'react-hot-toast';
import { 
  Database, 
  Plus, 
  Trash2, 
  Edit, 
  ExternalLink, 
  TestTube,
  CheckCircle,
  XCircle,
  Key,
  AlertCircle,
  Mail,
  ChevronDown,
  ChevronUp,
  Clock
} from 'lucide-react';
import EmailServiceModal from '../components/EmailServiceModal';

const Databases = () => {
  const [databases, setDatabases] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showTokenManager, setShowTokenManager] = useState(false);
  const [testingConnection, setTestingConnection] = useState(null);
  const [editingDatabase, setEditingDatabase] = useState(null);
  const [useStoredToken, setUseStoredToken] = useState(true);
  const [emailServices, setEmailServices] = useState({});
  const [showEmailServiceModal, setShowEmailServiceModal] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState(null);
  const [editingService, setEditingService] = useState(null);
  const [expandedDatabases, setExpandedDatabases] = useState({});

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm();

  useEffect(() => {
    fetchDatabases();
    fetchTokens();
  }, []);

  const fetchDatabases = async () => {
    try {
      const response = await apiService.get('/databases');
      setDatabases(response.data.databases);
      // Fetch email services for each database
      response.data.databases.forEach(db => {
        fetchEmailServices(db.id);
      });
    } catch (error) {
      console.error('Failed to fetch databases:', error);
      toast.error('Failed to load databases');
    } finally {
      setLoading(false);
    }
  };

  const fetchTokens = async () => {
    try {
      const response = await apiService.get('/databases/tokens');
      setTokens(response.data.tokens);
    } catch (error) {
      console.error('Failed to fetch tokens:', error);
    }
  };

  const fetchEmailServices = async (databaseId) => {
    try {
      const response = await apiService.get(`/email-services/database/${databaseId}`);
      setEmailServices(prev => ({
        ...prev,
        [databaseId]: response.data.services
      }));
    } catch (error) {
      console.error(`Failed to fetch email services for database ${databaseId}:`, error);
    }
  };

  const handleAddEmailService = (database) => {
    setSelectedDatabase(database);
    setEditingService(null);
    setShowEmailServiceModal(true);
  };

  const handleEditEmailService = (database, service) => {
    setSelectedDatabase(database);
    setEditingService(service);
    setShowEmailServiceModal(true);
  };

  const handleDeleteEmailService = async (serviceId, databaseId) => {
    if (!window.confirm('Are you sure you want to delete this email service?')) {
      return;
    }

    try {
      await apiService.delete(`/email-services/${serviceId}`);
      toast.success('Email service deleted successfully');
      fetchEmailServices(databaseId);
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to delete email service';
      toast.error(message);
    }
  };

  const handleEmailServiceSave = (service) => {
    fetchEmailServices(service.database_id);
  };

  const toggleDatabaseExpand = (databaseId) => {
    setExpandedDatabases(prev => ({
      ...prev,
      [databaseId]: !prev[databaseId]
    }));
  };

  const onSubmit = async (data) => {
    try {
      // Build payload expected by backend
      const payload = {
        data_source_id: data.data_source_id
      };

      // Add token info based on selection
      if (useStoredToken && data.token_id) {
        payload.token_id = parseInt(data.token_id);
      } else if (data.notion_api_key) {
        payload.notion_api_key = data.notion_api_key;
        payload.token_name = data.token_name || 'My Token';
      } else {
        toast.error('Please provide a token or select a stored token');
        return;
      }

      if (editingDatabase) {
        await apiService.put(`/databases/${editingDatabase.id}`, payload);
        toast.success('Database updated successfully!');
        setEditingDatabase(null);
      } else {
        await apiService.post('/databases', payload);
        toast.success('Database added successfully!');
      }
      fetchDatabases();
      fetchTokens();
      reset();
      setShowAddForm(false);
      setUseStoredToken(true);
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to save database';
      toast.error(message);
    }
  };

  const handleDelete = async (databaseId) => {
    if (!window.confirm('Are you sure you want to delete this database?')) {
      return;
    }

    try {
      await apiService.delete(`/databases/${databaseId}`);
      toast.success('Database deleted successfully!');
      fetchDatabases();
    } catch (error) {
      toast.error('Failed to delete database');
    }
  };

  const handleTestConnection = async (databaseId) => {
    setTestingConnection(databaseId);
    try {
      const response = await apiService.post(`/databases/${databaseId}/test`, {});

      toast.success('Connection successful!');
      console.log('Test results:', response.data);
    } catch (error) {
      const message = error.response?.data?.error || 'Connection test failed';
      toast.error(message);
    } finally {
      setTestingConnection(null);
    }
  };

  const handleEdit = (database) => {
    setEditingDatabase(database);
    setValue('data_source_id', database.data_source_id || database.database_id || database.database_url);
    if (database.token_id) {
      setValue('token_id', database.token_id);
      setUseStoredToken(true);
    } else {
      setValue('notion_api_key', '');
      setUseStoredToken(false);
    }
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingDatabase(null);
    reset();
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notion Databases</h1>
          <p className="mt-2 text-gray-600">
            Manage your connected Notion databases for vocabulary learning.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="btn-primary inline-flex items-center cursor-pointer"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Data Source
        </button>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="card mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {editingDatabase ? 'Edit Database' : 'Add New Database'}
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Privacy Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Privacy Notice</p>
                <p>We store your Notion integration tokens securely to enable automatic email delivery. Your tokens are encrypted and never shared with third parties.</p>
              </div>
            </div>

            {/* Token Selection */}
            <div>
              <label className="form-label">Token Source</label>
              <div className="flex items-center space-x-4 mb-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    checked={useStoredToken}
                    onChange={() => setUseStoredToken(true)}
                    className="mr-2"
                  />
                  <span className="text-sm">Use stored token</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    checked={!useStoredToken}
                    onChange={() => setUseStoredToken(false)}
                    className="mr-2"
                  />
                  <span className="text-sm">Add new token</span>
                </label>
              </div>

              {useStoredToken ? (
                <div>
                  <select
                    id="token_id"
                    className="input-field"
                    {...register('token_id', {
                      required: useStoredToken ? 'Please select a token' : false
                    })}
                  >
                    <option value="">Select a token</option>
                    {tokens.map(token => (
                      <option key={token.id} value={token.id}>
                        {token.token_name} ({token.database_count} databases)
                      </option>
                    ))}
                  </select>
                  {errors.token_id && (
                    <p className="mt-1 text-sm text-red-600">{errors.token_id.message}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTokenManager(true)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700 flex items-center"
                  >
                    <Key className="h-4 w-4 mr-1" />
                    Manage tokens
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="token_name" className="form-label text-sm">
                      Token Name (optional)
                    </label>
                    <input
                      id="token_name"
                      type="text"
                      className="input-field"
                      placeholder="e.g., My Workspace Token"
                      {...register('token_name')}
                    />
                  </div>
                  <div>
                    <label htmlFor="notion_api_key" className="form-label">
                      Integration Token
                    </label>
                    <input
                      id="notion_api_key"
                      type="password"
                      autoComplete="new-password"
                      className={`input-field ${
                        errors.notion_api_key ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
                      }`}
                      placeholder="secret_xxx from your Notion integration"
                      {...register('notion_api_key', {
                        required: !useStoredToken ? 'Integration Token is required' : false,
                        minLength: { value: 10, message: 'Token looks too short' },
                      })}
                    />
                    {errors.notion_api_key && (
                      <p className="mt-1 text-sm text-red-600">{errors.notion_api_key.message}</p>
                    )}
                    <p className="mt-1 text-sm text-gray-500">
                      Create a Notion internal integration and copy its secret. This token will be saved securely.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="data_source_id" className="form-label">
                Data Source ID
              </label>
              <input
                id="data_source_id"
                type="text"
                className={`input-field ${
                  errors.data_source_id ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
                }`}
                placeholder="Enter a 32-character Notion Data Source ID"
                {...register('data_source_id', {
                  required: 'Data Source ID is required',
                  validate: (value) => {
                    const idRegex = /^(?:[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
                    return idRegex.test(value) || 'Enter a valid 32-character Data Source ID';
                  },
                })}
              />
              {errors.data_source_id && (
                <p className="mt-1 text-sm text-red-600">{errors.data_source_id.message}</p>
              )}
              <p className="mt-1 text-sm text-gray-500">
                Paste the 32-character Notion data source ID.
              </p>
            </div>

            <div className="flex space-x-4">
              <button type="submit" className="btn-primary">
                {editingDatabase ? 'Update Data Source' : 'Add Data Source'}
              </button>
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Databases List */}
      <div className="space-y-4">
        {databases.length === 0 ? (
          <div className="card text-center py-12">
            <Database className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No databases connected</h3>
            <p className="text-gray-600 mb-6">
              Connect your first Notion database to start receiving vocabulary emails.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="btn-primary inline-flex items-center"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Database
            </button>
          </div>
        ) : (
          databases.map((database) => {
            const services = emailServices[database.id] || [];
            const isExpanded = expandedDatabases[database.id];
            
            return (
            <div key={database.id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-grow">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Database className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="flex-grow">
                    <h3 className="text-lg font-medium text-gray-900">
                      {database.database_name}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                      <span>Added on {new Date(database.created_at).toLocaleDateString()}</span>
                      <span className="flex items-center">
                        <Mail className="h-3 w-3 mr-1" />
                        {services.length} service{services.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    database.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {database.is_active ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </>
                    )}
                  </span>

                  <button
                    onClick={() => handleTestConnection(database.id)}
                    disabled={testingConnection === database.id}
                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors duration-200 cursor-pointer"
                    title="Test connection"
                  >
                    {testingConnection === database.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    ) : (
                      <TestTube className="h-4 w-4" />
                    )}
                  </button>

                  <a
                    href={database.database_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors duration-200"
                    title="Open in Notion"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>

                  <button
                    onClick={() => handleEdit(database)}
                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors duration-200 cursor-pointer"
                    title="Edit database"
                  >
                    <Edit className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => handleDelete(database.id)}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors duration-200 cursor-pointer"
                    title="Delete database"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => toggleDatabaseExpand(database.id)}
                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors duration-200 cursor-pointer"
                    title={isExpanded ? "Hide email services" : "Show email services"}
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Email Services Section */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-900 flex items-center">
                      <Mail className="h-4 w-4 mr-2" />
                      Email Services ({services.length})
                    </h4>
                    <button
                      onClick={() => handleAddEmailService(database)}
                      className="btn-secondary text-sm py-1 px-3 inline-flex items-center cursor-pointer"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Service
                    </button>
                  </div>

                  {services.length === 0 ? (
                    <div className="text-center py-6 bg-gray-50 rounded-lg">
                      <Mail className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 mb-3">
                        No email services configured for this database
                      </p>
                      <button
                        onClick={() => handleAddEmailService(database)}
                        className="btn-primary text-sm py-1 px-4 inline-flex items-center cursor-pointer"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Create First Service
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {services.map((service) => (
                        <div
                          key={service.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex-grow">
                            <div className="flex items-center space-x-2">
                              <h5 className="text-sm font-medium text-gray-900">
                                {service.service_name}
                              </h5>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                service.is_active
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {service.is_active ? 'Active' : 'Inactive'}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {service.selection_method}
                              </span>
                            </div>
                            <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                              <span className="flex items-center">
                                <Clock className="h-3 w-3 mr-1" />
                                {service.send_time} ({service.timezone})
                              </span>
                              <span>{service.frequency}</span>
                              <span>{service.vocabulary_count} items</span>
                              {service.last_sent_at && (
                                <span>Last sent: {new Date(service.last_sent_at).toLocaleDateString()}</span>
                              )}
                            </div>
                            {service.description && (
                              <p className="text-xs text-gray-500 mt-1">{service.description}</p>
                            )}
                          </div>
                          <div className="flex items-center space-x-1 ml-4">
                            <button
                              onClick={() => handleEditEmailService(database, service)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer"
                              title="Edit service"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteEmailService(service.id, database.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                              title="Delete service"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
          })
        )}
      </div>

      {/* Token Manager Modal */}
      {showTokenManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                  <Key className="h-5 w-5 mr-2" />
                  Manage Notion Tokens
                </h2>
                <button
                  onClick={() => setShowTokenManager(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              {tokens.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Key className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No tokens stored yet.</p>
                  <p className="text-sm mt-2">Add a database with a new token to get started.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tokens.map(token => (
                    <div key={token.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-gray-900">{token.token_name}</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            {token.database_count} database(s) connected
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Added on {new Date(token.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            token.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {token.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowTokenManager(false)}
                  className="btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Service Modal */}
      <EmailServiceModal
        isOpen={showEmailServiceModal}
        onClose={() => {
          setShowEmailServiceModal(false);
          setSelectedDatabase(null);
          setEditingService(null);
        }}
        database={selectedDatabase}
        service={editingService}
        onSave={handleEmailServiceSave}
      />
    </div>
  );
};

export default Databases; 