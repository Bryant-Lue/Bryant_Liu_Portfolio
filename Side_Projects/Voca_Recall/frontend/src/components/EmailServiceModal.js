import React, { useState, useEffect } from 'react';
import { X, Save, Clock, Hash, Filter, Calendar, List, GripVertical, Eye, EyeOff, Mail } from 'lucide-react';
import apiService from '../utils/apiService';
import toast from 'react-hot-toast';

const EmailServiceModal = ({ isOpen, onClose, database, databases = null, service = null, onSave }) => {
  const [formData, setFormData] = useState({
    service_name: '',
    description: '',
    send_time: '09:00',
    timezone: 'Asia/Taipei',
    frequency: 'daily',
    vocabulary_count: 10,
    selection_method: 'random',
    email_client: 'apple_mail',
    date_range_start: '',
    date_range_end: '',
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  // Selected database ID (used in create mode when `databases` array is provided)
  const [selectedDatabaseId, setSelectedDatabaseId] = useState('');
  
  // Column Selection Stuffs
  const [availableColumns, setAvailableColumns] = useState([]);
  const [columnsConfig, setColumnsConfig] = useState([]); // Array of { ...col, isVisible: boolean }
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState(null);

  // Resolve the active database ID from props
  const getActiveDatabaseId = () => {
    if (service) return service.database_id;
    if (selectedDatabaseId) return selectedDatabaseId;
    if (database) return database.id;
    return null;
  };

  // Initialize selectedDatabaseId when the modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (service) {
      setSelectedDatabaseId(String(service.database_id));
    } else if (databases && databases.length > 0) {
      setSelectedDatabaseId(String(databases[0].id));
    } else if (database) {
      setSelectedDatabaseId(String(database.id));
    }
  }, [isOpen, service, databases, database]);

  useEffect(() => {
    // Determine database ID inline to avoid stale closure issues
    const dbId = service
      ? service.database_id
      : selectedDatabaseId || (database ? database.id : null);

    if (dbId) {
       fetchColumns(dbId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, database, selectedDatabaseId]);

  const fetchColumns = async (dbId) => {
    setLoadingColumns(true);
    try {
        const response = await apiService.get(`/databases/${dbId}/properties`);
        if (response.data && response.data.columns) {
            setAvailableColumns(response.data.columns);
        }
    } catch (error) {
        console.error("Failed to fetch columns", error);
        // Don't show toast error here to avoid annoyance if it fails silently
    } finally {
        setLoadingColumns(false);
    }
  };

  useEffect(() => {
    if (service) {
      // Edit mode: populate form with service data
      setFormData({
        service_name: service.service_name || '',
        description: service.description || '',
        send_time: service.send_time || '09:00',
        timezone: service.timezone || 'Asia/Taipei',
        frequency: service.frequency || 'daily',
        vocabulary_count: service.vocabulary_count || 10,
        selection_method: service.selection_method || 'random',
        email_client: service.email_client || 'apple_mail',
        date_range_start: service.date_range_start || '',
        date_range_end: service.date_range_end || '',
        is_active: service.is_active !== undefined ? service.is_active : true,
      });
    } else {
      // Create mode: set default name based on the selected/provided database
      const activeDb = databases
        ? databases.find(db => String(db.id) === String(selectedDatabaseId))
        : database;
      if (activeDb) {
        setFormData(prev => ({
          ...prev,
          service_name: `${activeDb.database_name} - Email Service`,
        }));
      }
    }
  }, [service, database, databases, selectedDatabaseId]);

  // Initialize columns configuration based on available columns and saved service selection
  useEffect(() => {
    if (availableColumns.length === 0) return;

    const savedSelection = (service && service.column_selection) ? service.column_selection : [];
    
    // If we have a saved selection, we want to respect its order and visibility
    if (savedSelection.length > 0) {
        const savedMap = new Map();
        savedSelection.forEach((col, index) => {
            savedMap.set(col.name, { index, col }); 
        });

        // Visible columns (in saved order)
        const visibleCols = availableColumns
            .filter(col => savedMap.has(col.name))
            .map(col => ({ ...col, isVisible: true }))
            .sort((a, b) => savedMap.get(a.name).index - savedMap.get(b.name).index);

        // Hidden columns (append at the end)
        const hiddenCols = availableColumns
            .filter(col => !savedMap.has(col.name))
            .map(col => ({ ...col, isVisible: false }));

        setColumnsConfig([...visibleCols, ...hiddenCols]);
    } else {
        // Default: All visible except unique_id columns, original order
        setColumnsConfig(availableColumns.map(col => ({ ...col, isVisible: col.type !== 'unique_id' })));
    }
  }, [availableColumns, service]);

  // Column Handlers
  const handleToggleVisibility = (index) => {
      const newConfig = [...columnsConfig];
      newConfig[index].isVisible = !newConfig[index].isVisible;
      setColumnsConfig(newConfig);
  };

  const handleDragStart = (e, index) => {
      setDragStartIndex(index);
      e.dataTransfer.effectAllowed = "move";
      // Firefox requires data to be set
      e.dataTransfer.setData("text/plain", index); 
      // Optional: set custom drag image
  };

  const handleDragOver = (e, index) => {
      e.preventDefault(); // allow drop
      // Optional implementation: reorder on hover (smoother)
      // For now, we'll do reorder on drop or just simple swap visuals
  };

  const handleDrop = (e, targetIndex) => {
      e.preventDefault();
      if (dragStartIndex === null || dragStartIndex === targetIndex) return;
      
      const newConfig = [...columnsConfig];
      const [movedItem] = newConfig.splice(dragStartIndex, 1);
      newConfig.splice(targetIndex, 0, movedItem);
      
      setColumnsConfig(newConfig);
      setDragStartIndex(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prepare column selection: only visible columns, in order
    const selectedColumns = columnsConfig
        .filter(c => c.isVisible)
        .map(({ isVisible, ...col }) => col); // remove isVisible prop for backend

    if (selectedColumns.length === 0) {
        toast.error('Please select at least one property to display.');
        return;
    }

    setSaving(true);

    try {
      const payload = {
        ...formData,
        database_id: getActiveDatabaseId(),
        column_selection: selectedColumns
      };

      let response;
      if (service) {
        // Update existing service
        response = await apiService.put(`/email-services/${service.id}`, payload);
      } else {
        // Create new service
        response = await apiService.post('/email-services', payload);
      }

      toast.success(service ? 'Service updated successfully!' : 'Service created successfully!');
      onSave(response.data.service);
      onClose();
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to save service';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {service ? 'Edit Email Service' : 'Create Email Service'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Data Source Selection - only in create mode with multiple data sources */}
          {!service && databases && databases.length > 0 && (
            <div>
              <label className="form-label">Select Data Source *</label>
              <select
                value={selectedDatabaseId}
                onChange={(e) => setSelectedDatabaseId(e.target.value)}
                className="input-field"
                required
              >
                {databases.map((db) => (
                  <option key={db.id} value={db.id}>
                    {db.database_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Service Name */}
          <div>
            <label className="form-label">Service Name *</label>
            <input
              type="text"
              value={formData.service_name}
              onChange={(e) => setFormData({ ...formData, service_name: e.target.value })}
              className="input-field"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="form-label">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input-field"
              rows="3"
              placeholder="Optional description for this email service"
            />
          </div>

          {/* Schedule Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Clock className="h-5 w-5 mr-2" />
              Schedule
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Send Time *</label>
                <input
                  type="time"
                  value={formData.send_time}
                  onChange={(e) => setFormData({ ...formData, send_time: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="form-label">Timezone *</label>
                <select
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="input-field"
                  required
                >
                  <option value="UTC">UTC +0</option>
                  <option value="America/New_York">Eastern Time (US & Canada) -5/-4</option>
                  <option value="America/Chicago">Central Time (US & Canada) -6/-5</option>
                  <option value="America/Denver">Mountain Time (US & Canada) -7/-6</option>
                  <option value="America/Los_Angeles">Pacific Time (US & Canada) -8/-7</option>
                  <option value="Europe/London">London +0/+1</option>
                  <option value="Europe/Paris">Paris +1/+2</option>
                  <option value="Europe/Berlin">Berlin +1/+2</option>
                  <option value="Asia/Tokyo">Tokyo +9</option>
                  <option value="Asia/Shanghai">Shanghai +8</option>
                  <option value="Asia/Taipei">Taiwan +8</option>
                  <option value="Asia/Hong_Kong">Hong Kong +8</option>
                  <option value="Asia/Singapore">Singapore +8</option>
                  <option value="Australia/Sydney">Sydney +10/+11</option>
                </select>
              </div>

              <div>
                <label className="form-label">Frequency *</label>
                <select
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                  className="input-field"
                  required
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
          </div>

          {/* Vocabulary Settings Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Hash className="h-5 w-5 mr-2" />
              Vocabulary Settings
            </h3>

            <div className="space-y-4">
              <div>
                <label className="form-label">Vocabulary Count *</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.vocabulary_count}
                  onChange={(e) => setFormData({ ...formData, vocabulary_count: parseInt(e.target.value) })}
                  className="input-field"
                  required
                />
                <p className="mt-1 text-sm text-gray-500">
                  Number of vocabulary items per email (1-50)
                </p>
              </div>

              <div>
                <label className="form-label flex items-center">
                  <Filter className="h-4 w-4 mr-2" />
                  Selection Method *
                </label>
                <select
                  value={formData.selection_method}
                  onChange={(e) => setFormData({ ...formData, selection_method: e.target.value })}
                  className="input-field"
                  required
                >
                  <option value="random">Random Selection</option>
                  <option value="latest">Latest Items</option>
                  <option value="date_range">Date Range Selection</option>
                </select>
                <p className="mt-1 text-sm text-gray-500">
                  {formData.selection_method === 'random' && 'Randomly select items from the entire database'}
                  {formData.selection_method === 'latest' && 'Select the most recently created items'}
                  {formData.selection_method === 'date_range' && 'Select items created within a specific date range'}
                </p>
              </div>

              {/* Date Range Fields - Only show for date_range selection method */}
              {formData.selection_method === 'date_range' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="form-label flex items-center mb-3">
                    <Calendar className="h-4 w-4 mr-2" />
                    Date Range
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-600 mb-1 block">Start Date</label>
                      <input
                        type="date"
                        value={formData.date_range_start}
                        onChange={(e) => setFormData({ ...formData, date_range_start: e.target.value })}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 mb-1 block">End Date</label>
                      <input
                        type="date"
                        value={formData.date_range_end}
                        onChange={(e) => setFormData({ ...formData, date_range_end: e.target.value })}
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Column Selection Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <List className="h-5 w-5 mr-2" />
              Content Configuration
            </h3>
            
            <p className="text-sm text-gray-500 mb-4">
               Reorder properties to change their display order. Toggle visibility (eye icon) to include or exclude them from the email.
               <br/>
               The first visible property will be used as the <strong>Main Title/Word</strong>.
            </p>

            {/* Email Client Preference */}
            <div className="mb-6">
              <label className="form-label flex items-center">
                <Mail className="h-4 w-4 mr-2" />
                Preferred Email Client *
              </label>
              <select
                value={formData.email_client}
                onChange={(e) => setFormData({ ...formData, email_client: e.target.value })}
                className="input-field"
                required
              >
                <option value="apple_mail">Apple Mail</option>
                <option value="gmail">Gmail</option>
                <option value="outlook">Outlook</option>
              </select>
              <p className="mt-1 text-sm text-gray-500">
                {formData.email_client === 'apple_mail'
                  ? 'Words appear as interactive flashcards you can tap to reveal details.'
                  : 'Gmail and Outlook do not support interactive toggles, so each word is shown in bold with its details displayed below.'}
              </p>
            </div>

            <div className="space-y-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
                {loadingColumns ? (
                    <div className="text-center py-8 text-gray-500 animate-pulse">Loading Notion properties...</div>
                ) : columnsConfig.length > 0 ? (
                    <div className="space-y-2">
                        {columnsConfig.map((col, index) => {
                            // Determine if this is the first visible column (Main Title)
                            const firstVisibleIndex = columnsConfig.findIndex(c => c.isVisible);
                            const isMainTitle = col.isVisible && index === firstVisibleIndex;
                            
                            return (
                                <div 
                                    key={col.name} 
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDrop={(e) => handleDrop(e, index)}
                                    className={`flex items-center justify-between p-3 bg-white border rounded-md shadow-sm transition-all ${
                                        col.isVisible ? 'border-gray-200 opacity-100' : 'border-dashed border-gray-200 opacity-60 bg-gray-50'
                                    } hover:border-blue-300`}
                                >
                                    <div className="flex items-center flex-1 overflow-hidden">
                                        <div 
                                            className="mr-3 text-gray-400 cursor-move hover:text-gray-600"
                                            title="Drag to reorder"
                                        >
                                            <GripVertical className="h-5 w-5" />
                                        </div>
                                        
                                        <button 
                                            type="button"
                                            onClick={() => handleToggleVisibility(index)}
                                            className={`mr-3 p-1.5 rounded-full hover:bg-gray-100 transition-colors ${
                                                col.isVisible ? 'text-gray-700' : 'text-gray-400'
                                            }`}
                                            title={col.isVisible ? "Hide property" : "Show property"}
                                        >
                                            {col.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                        </button>

                                        <div className="flex flex-col flex-1 min-w-0">
                                            <div className="flex items-center">
                                                <span className={`font-medium truncate ${col.isVisible ? 'text-gray-900' : 'text-gray-500 decoration-slice'}`}>
                                                    {col.name}
                                                </span>
                                                {isMainTitle && (
                                                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full font-bold whitespace-nowrap">
                                                        Main Title
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-gray-400 capitalize">{col.type}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
                        <p className="text-gray-500 italic">
                            No properties found. Please check your database connection.
                        </p>
                    </div>
                )}
            </div>
          </div>

          {/* Active Status */}
          <div className="border-t pt-6">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                Active (send emails automatically)
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="border-t pt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary inline-flex items-center"
              disabled={saving}
            >
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {service ? 'Update Service' : 'Create Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmailServiceModal;
