export const verifyWebsiteApiKey = (req,res,next)=>{

    const apiKey=req.header("x-api-key");

    if(!apiKey){

        return res.status(401).json({

            message:"API Key Missing"

        });

    }

    if(apiKey!==process.env.WEBSITE_API_KEY){

        return res.status(401).json({

            message:"Invalid API Key"

        });

    }

    next();

}