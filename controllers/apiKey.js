import prisma from '../config/db.js';
import crypto from 'crypto';


/**
 * @Description  Get API Keys Preview
 * @Route GET /api/keys/get-all
 * @Access Public
 */
export const getKeys = async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const data = keys.map(k => ({
      ...k,
      keyPreview: k.keyValue.slice(0, 8) + '...',
      keyValue: undefined,
    }));
    res.json({
      status: true,
      msg: "API Keys fetched successfully",
      data
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      msg: err.message
    });
  }
};


/**
 * @Description  Create API Key
 * @Route POST /api/keys/create
 * @Access Public
 */
export const createKey = async (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ 
        status: false, 
        msg: 'Name is required' 
      });
    }
  try {
    const keyValue = `aqm_${crypto.randomBytes(24).toString('hex')}`;
    const data = await prisma.apiKey.create({
      data: { name: name.trim(), keyValue },
    });

    res.status(201).json({
      status: true,
      msg: "API Key created successfully",
      data
    });

  } catch (err) {
    res.status(500).json({
      status: false,
      msg: err.message
    });
  }
};

/**
 * @Description  Delete API Key
 * @Route DELETE /api/keys/:id
 * @Access Public
 */
export const deleteKey = async (req, res) => {
  try {
    await prisma.apiKey.delete({ where: { id: parseInt(req.params.id) } });
    res.json({
       status: true, 
       msg: 'Key deleted' 
    });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ 
      status: false, 
      msg: 'Key not found' 
    });
    res.status(500).json({
       status: false, 
       msg: err.message 
    });
  }
};

/**
 * @Description  Toggle API Key Activation
 * @Route PUT /api/keys/:id/toggle
 * @Access Public
 */
export const toggleKey = async (req, res) => {
  const id = parseInt(req.params.id);
  try {

    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ 
      status: false, 
      msg: 'Key not found' 
    });

    const data = await prisma.apiKey.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });
    const { keyValue: _, ...safe } = data;
    res.json({
      status: true,
      msg: "API Key toggled successfully",
      data
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      msg: err.message
    });
  }
};


