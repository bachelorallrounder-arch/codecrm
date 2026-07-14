import Lead from "../models/Lead.js";
import Brand from "../models/Brand.js";
import Course from "../models/Course.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
export const createWebsiteLead = async (req, res) => {

    try {

        const {

            name,

            mobile,

            email,

            language,

            page,

            brand,

            course,

            source,

            remarks

        } = req.body;

        if (!name || !mobile) {

            return res.status(400).json({

                success:false,

                message:"Name & Mobile Required"

            });

        }

        // Duplicate Check

        const duplicate = await Lead.findOne({

            mobile

        });

        if (duplicate) {

            return res.json({

                success:true,

                duplicate:true,

                message:"Lead already exists"

            });

        }

        //-------------------------------------

        let brandDoc = await Brand.findOne({

            name:brand

        });

        if(!brandDoc){

            brandDoc = await Brand.create({

                name:brand

            });

        }

        //-------------------------------------

        let courseDoc = await Course.findOne({

            name:course

        });

        if(!courseDoc){

            courseDoc = await Course.create({

                name:course

            });

        }

        //-------------------------------------

        let counsellor = await User.findOne({

            role:"counsellor",

            assignedCourses:courseDoc._id

        });

        //-------------------------------------

        const lead = await Lead.create({

            name,

            mobile,

            email,

            language,

            brand:brandDoc._id,

            course:courseDoc._id,

            source,

            remarks,

            page,

            assignedTo:counsellor?._id,

            status:"Fresh"

        });

        //-------------------------------------

        await AuditLog.create({

            user:null,

            action:"website_lead",

            entity:"Lead",

            entityId:lead._id,

            details:req.body

        });

        //-------------------------------------

        res.status(201).json({

            success:true,

            leadId:lead._id

        });

    }

    catch(err){

        console.log(err);

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

}