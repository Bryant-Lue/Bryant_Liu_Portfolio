import React, { useState, useEffect } from 'react';
import { X, Send, Hash, Filter, Calendar, List, GripVertical, Eye, EyeOff, Mail } from 'lucide-react';
import apiService from '../utils/apiService';
import toast from 'react-hot-toast';

const TestEmailModal = ({ isOpen, onClose, databases }) => {
  const [formData, setFormData] = useState({
    database_id: '',
    vocabulary_count: 10,
    selection_method: 'random',
    email_client: 'apple_mail',
    date_range_start: '',
    date_range_end: '',
  });
  const [sending, setSending] = useState(false);
  
  // Column Selection Stuffs
  const [availableColumns, setAvailableColumns] = useState([]);
  const [columnsConfig, setColumnsConfig] = useState([]); // Array of { ...col, isVisible: boolean }
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState(null);

  useEffect(() => {
    if (databases && databases.length > 0 && !formData.database_id) {
      setFormData(prev => ({
        ...prev,
        database_id: databases[0].id.toString()
      }));
    }
  }, [databases, formData.database_id]);

  useEffect(() => {
    if (formData.database_id) {
      fetchColumns(formData.database_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.database_id]);

  const fetchColumns = async (dbId) => {
    setLoadingColumns(true);
    try {
      const response = await apiService.get(`/databases/${dbId}/properties`);
      if (response.data && response.data.columns) {
        setAvailableColumns(response.data.columns);
      }
    } catch (error) {
      console.error("Failed to fetch columns", error);
    } finally {
      setLoadingColumns(false);
    }
  };

  // Initialize columns configuration - all visible by default, except unique_id columns
  useEffect(() => {
    if (availableColumns.length > 0) {
      setColumnsConfig(availableColumns.map(col => ({ ...col, isVisible: col.type !== 'unique_id' })));
    }
  }, [availableColumns]);

  // Column Handlers
  const handleToggleVisibility = (index) => {
    const newConfig = [...columnsConfig];
    newConfig[index].isVisible = !newConfig[index].isVisible;
    setColumnsConfig(newConfig);
  };

  const handleDragStart = (e, index) => {
    setDragStartIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
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
      .map(({ isVisible, ...col }) => col);

    if (selectedColumns.length === 0) {
      toast.error('Please select at least one property to display.');
      return;
    }

    setSending(true);

    try {
      await apiService.post('/email/send-test', {
        database_pk: parseInt(formData.database_id),
        vocabulary_count: parseInt(formData.vocabulary_count),
        selection_method: formData.selection_method,
        email_client: formData.email_client,
        date_range_start: formData.date_range_start || null,
        date_range_end: formData.date_range_end || null,
        column_selection: selectedColumns
      });

      toast.success('Test email sent successfully!');
      onClose();
    } catch (error) {
      const message = error.message || 'Failed to send test email';
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            Send Test Email
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Data Source Selection */}
          <div>
            <label className="form-label">Select Data Source *</label>
            <select
              value={formData.database_id}
              onChange={(e) => setFormData({ ...formData, database_id: e.target.value })}
              className="input-field"
              required
            >
              {databases && databases.map((db) => (
                <option key={db.id} value={db.id}>
                  {db.database_name}
                </option>
              ))}
            </select>
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
                              <span className={`font-medium truncate ${col.isVisible ? 'text-gray-900' : 'text-gray-500'}`}>
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

          {/* Action Buttons */}
          <div className="border-t pt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={sending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary inline-flex items-center"
              disabled={sending}
            >
              {sending ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Test Email
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TestEmailModal;
